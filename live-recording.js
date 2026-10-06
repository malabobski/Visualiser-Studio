(() => {
  const setup=$('recordSetup'), preview=$('recordPreview'), stage=$('liveStage');
  const bar=document.createElement('div'); bar.className='live-recording-bar';bar.hidden=true;
  bar.innerHTML='<span class="record-indicator" aria-hidden="true"></span><span id="recordElapsed" role="timer">0:00</span><button id="recordPause" type="button">Pause</button><button id="recordStop" type="button">Stop</button>';
  stage.append(bar);
  let recorder, outputStream, clock, chunks=[], blob, videoURL, started=0, accumulated=0, busy=false;
  let lastFrame=0, output, outputCtx, fps=60, includeMedia=false, liveDimensions;
  const active=()=>recorder && recorder.state!=='inactive';
  window.getLiveRecordingActivity=()=>({
    state:active()?recorder.state:blob?(busy?'saving':'review'):setup.open?'setup':'idle',
    quality:output?.height || Number($('recordQuality').value),fps
  });
  const status=text=>$('recordSetupStatus').textContent=text;
  const notice=text=>$('recordSaveStatus').textContent=text;
  const clearPreview=()=>{
    $('recordVideo').pause();$('recordVideo').removeAttribute('src');$('recordVideo').load();
    if(videoURL)URL.revokeObjectURL(videoURL);videoURL=null;blob=null;chunks=[];
    $('liveRecordSetup').textContent='Record video';
  };
  const release=()=>{
    window.liveRecordingFrame=null;clearInterval(clock);bar.hidden=true;
    if(liveDimensions){$('liveCanvas').width=liveDimensions.width;$('liveCanvas').height=liveDimensions.height;liveDimensions=null;}
    $('liveQuality').disabled=false;
    outputStream?.getTracks().forEach(track=>track.stop());outputStream=null;
    $('liveRecordSetup').disabled=false;
  };
  function paint(now) {
    if(!active())return;
    if(recorder.state==='recording' && now + 1 >= lastFrame) {
      const interval=1000/fps;
      if(!lastFrame)lastFrame=now;
      lastFrame += Math.max(1,Math.floor((now-lastFrame)/interval)+1)*interval;
      outputCtx.drawImage($('liveCanvas'),0,0,output.width,output.height);
      if(includeMedia && desktopMedia) {
        const unit=output.height/720, width=390*unit, height=112*unit, x=output.width-width-24*unit,y=output.height-height-24*unit;
        outputCtx.fillStyle='rgba(20,25,39,.82)';outputCtx.beginPath();outputCtx.roundRect(x,y,width,height,16*unit);outputCtx.fill();
        const art=$('nowPlayingArt'); const hasArt=!art.hidden && art.complete && art.naturalWidth;
        if(hasArt) { outputCtx.save();outputCtx.beginPath();outputCtx.roundRect(x+14*unit,y+14*unit,84*unit,84*unit,10*unit);outputCtx.clip();outputCtx.drawImage(art,x+14*unit,y+14*unit,84*unit,84*unit);outputCtx.restore(); }
        const textX=x+(hasArt?114:18)*unit, textWidth=width-(hasArt?132:36)*unit;
        outputCtx.save();outputCtx.beginPath();outputCtx.rect(textX,y+12*unit,textWidth,height-24*unit);outputCtx.clip();
        outputCtx.fillStyle='#aab5ce';outputCtx.font=`${11*unit}px sans-serif`;outputCtx.fillText(mediaSourceName(desktopMedia),textX,y+30*unit);
        outputCtx.fillStyle='#edf0ff';outputCtx.font=`600 ${18*unit}px sans-serif`;outputCtx.fillText(desktopMedia.title,textX,y+57*unit);
        outputCtx.fillStyle='#b0bad1';outputCtx.font=`${13*unit}px sans-serif`;outputCtx.fillText(desktopMedia.artist||'',textX,y+81*unit);outputCtx.restore();
      }
    }

  }
  function updateClock() {
    const time=accumulated+(recorder?.state==='recording'?performance.now()-started:0);
    $('recordElapsed').textContent=format(time/1000);
  }
  function showPreview() {
    if(!blob)return;
    $('recordVideo').src=videoURL;notice('Preview your recording, then save or discard it.');
    if(!preview.open)preview.showModal();
  }
  function stop() {
    if(!active())return;
    $('liveRecordSetup').disabled=true;
    recorder.stop();
  }
  $('liveRecordSetup').onclick=async()=>{
    if(blob)return showPreview();
    if(active())return;
    status('Desktop audio and visuals only. On-screen controls stay out of the video.');
    if(window.recordingFiles) {
      try { $('recordFolder').textContent=await window.recordingFiles.folder(); }
      catch { status('Could not load the saved location. You can choose it again.'); }
    } else { $('recordFolder').disabled=true; $('recordFolder').textContent='Choose when saving'; }
    setup.showModal();
  };
  $('recordFolder').onclick=async()=>{
    $('recordFolder').disabled=true;
    try { $('recordFolder').textContent=await window.recordingFiles.chooseFolder(); }
    catch { status('Could not set the save location. Please try again.'); }
    finally { $('recordFolder').disabled=false; }
  };
  $('recordSetupClose').onclick=()=>{if(!busy)setup.close();};
  setup.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
  $('recordStart').onclick=async()=>{
    if(busy || active() || blob)return;
    busy=true;$('recordStart').disabled=true;
    try {
      if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream)throw Error('Recording is unavailable in this browser.');
      if(!liveActive)await startLiveAudio();
      if(!liveActive || !liveStream?.getAudioTracks().some(track=>track.readyState==='live'))throw Error('Start desktop audio capture before recording.');
      fps=Number($('recordFps').value);includeMedia=$('recordIncludeMedia').checked;
      const liveCanvas=$('liveCanvas');
      liveDimensions={width:liveCanvas.width,height:liveCanvas.height};
      liveCanvas.height=Number($('recordQuality').value);liveCanvas.width=Math.round(liveCanvas.height*16/9);
      $('liveQuality').disabled=true;
      output=includeMedia?document.createElement('canvas'):liveCanvas;
      if(includeMedia){output.width=liveCanvas.width;output.height=liveCanvas.height;}
      outputCtx=output.getContext('2d');
      outputStream=output.captureStream(fps);
      liveStream.getAudioTracks().forEach(track=>outputStream.addTrack(track.clone()));
      const mimeType=['video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mimeType)throw Error('WebM recording is not supported here.');
      recorder=new MediaRecorder(outputStream,{mimeType,videoBitsPerSecond:Math.round(output.width*output.height*fps*.16),audioBitsPerSecond:320000,audioBitrateMode:'constant'});
      chunks=[];accumulated=0;lastFrame=0;
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onstop=()=>{
        const type=recorder.mimeType;release();
        blob=new Blob(chunks,{type});chunks=[];
        if(!blob.size){blob=null;showToast('No recording data was captured.');return;}
        videoURL=URL.createObjectURL(blob);$('liveRecordSetup').textContent='Review recording';showPreview();
      };
      recorder.onerror=()=>{showToast('Recording encountered an error.');stop();};
      recorder.start(1000);started=performance.now();bar.classList.remove('paused');bar.hidden=false;
      $('recordPause').textContent='Pause';$('recordElapsed').textContent='0:00';$('liveRecordSetup').disabled=true;
      setup.close();window.liveRecordingFrame=includeMedia?paint:null;clock=setInterval(updateClock,250);
    } catch(error) { release();status(error.message); }
    finally {busy=false;$('recordStart').disabled=false;}
  };
  $('recordPause').onclick=()=>{
    if(!active())return;
    if(recorder.state==='recording') { accumulated+=performance.now()-started;recorder.pause();$('recordPause').textContent='Resume';bar.classList.add('paused'); }
    else { recorder.resume();lastFrame=0;started=performance.now();$('recordPause').textContent='Pause';bar.classList.remove('paused'); }
    updateClock();
  };
  $('recordStop').onclick=stop;
  window.addEventListener('live-capture-stopping',stop);
  $('recordPreviewClose').onclick=()=>{if(!busy){$('recordVideo').pause();preview.close();}};
  preview.addEventListener('cancel',event=>{if(busy)event.preventDefault();else $('recordVideo').pause();});
  $('recordDiscard').onclick=()=>{if(busy)return;clearPreview();preview.close();};
  $('recordSave').onclick=async()=>{
    if(!blob || busy)return;
    busy=true;$('recordSave').disabled=true;$('recordDiscard').disabled=true;notice('Saving…');
    try {
      if(window.recordingFiles) {
        const result=await window.recordingFiles.save(await blob.arrayBuffer());
        if(!result.saved){notice('Save cancelled. Your recording is still here.');return;}
        showToast(`Saved to ${result.location}`);
      } else {
        const link=document.createElement('a');link.href=videoURL;link.download='live-visualiser-'+Date.now()+'.webm';link.click();showToast('Recording downloaded');
      }
      clearPreview();preview.close();
    } catch { notice('Could not save. Your recording is safe here; check the default folder or try another location.'); }
    finally {busy=false;$('recordSave').disabled=false;$('recordDiscard').disabled=false;}
  };
  // Allow changing the destination without leaving an unsaved preview.
  const destination=document.createElement('button');destination.type='button';destination.textContent='Default save location';
  destination.onclick=async()=>{
    if(busy || !window.recordingFiles)return;
    try {destination.textContent=await window.recordingFiles.chooseFolder();}
    catch {notice('Could not change the save location.');}
  };
  if(window.recordingFiles)$('recordSaveStatus').before(destination);
  window.addEventListener('beforeunload',event=>{if(active() || blob){event.preventDefault();event.returnValue='';}});
})();
