(() => {
  if(!window.fileBrowser)return;
  const bridge=window.fileBrowser,paths=new WeakMap();let current=null,location='',parent='',entries=[],chosen='',version=0,picking=false;
  const dialog=document.createElement('dialog');dialog.id='fileExplorer';
  dialog.innerHTML='<header><div><p class="eyebrow">YOUR FILES</p><h2>Choose a file</h2></div><button type="button" data-close aria-label="Close file explorer">×</button></header><div class="file-explorer-body"><nav aria-label="Locations"></nav><section><div class="file-explorer-tools"><button type="button" data-up data-hint="Parent folder" aria-label="Parent folder">↑</button><form data-path-form><input data-path aria-label="Folder path" spellcheck="false"></form><button type="button" data-new>New folder</button></div><input data-search type="search" placeholder="Find in this folder…" aria-label="Find in this folder"><div data-list role="listbox" aria-label="Files"></div><form data-new-form hidden><input data-folder-name placeholder="Folder name" aria-label="New folder name"><button type="submit">Create</button></form><p data-status role="status"></p></section></div><footer><label data-name-label hidden>File name<input data-name spellcheck="false"></label><div><button type="button" data-cancel>Cancel</button><button type="button" data-confirm>Open</button></div></footer>';
  document.body.append(dialog);const $=selector=>dialog.querySelector(selector);
  const previewArea=document.createElement('div');previewArea.className='file-explorer-content';
  const fileList=$('[data-list]');fileList.before(previewArea);previewArea.append(fileList);
  const preview=document.createElement('aside');preview.className='file-explorer-preview';preview.setAttribute('aria-label','Image preview');preview.setAttribute('aria-hidden','true');
  const previewImage=document.createElement('img');previewImage.alt='';const previewName=document.createElement('span');preview.append(previewImage,previewName);previewArea.append(preview);let previewVersion=0;
  function clearPreview(){previewVersion++;previewArea.classList.remove('has-preview');preview.setAttribute('aria-hidden','true');}
  dialog.addEventListener('close',clearPreview);
  async function showPreview(entry){
    clearPreview();if(entry.directory||!current?.accept?.includes('image'))return;const id=previewVersion;
    try{const src=await bridge.preview(entry.path);if(id!==previewVersion||!current||!src)return;
      const image=new Image();image.src=src;await image.decode();if(id!==previewVersion||!current)return;
      previewImage.src=src;previewImage.alt=entry.name;previewName.textContent=entry.name;preview.setAttribute('aria-hidden','false');previewArea.classList.add('has-preview');
    }catch{}
  }
  const types={audio:['mp3','wav','flac','ogg','m4a','aac','aiff','aif','opus','wma','webm','mp4'],image:['png','jpg','jpeg','webp','gif','bmp','avif','svg']};
  function accepts(name){if(!current?.accept)return true;const ext=name.split('.').pop().toLowerCase();return current.accept.split(',').some(value=>{value=value.trim().toLowerCase();return value.startsWith('.')?ext===value.slice(1):value.endsWith('/*')?types[value.split('/')[0]]?.includes(ext):ext===({ 'image/jpeg':'jpg','image/png':'png','image/webp':'webp' }[value]||value.split('/').pop());});}
  function render(){
    const list=$('[data-list]');list.replaceChildren();const query=$('[data-search]').value.toLowerCase();
    if(parent&&location!==parent){
      const up=document.createElement('button');up.type='button';up.className='file-explorer-entry';up.dataset.parent='';up.setAttribute('aria-label','Parent folder');up.setAttribute('role','option');up.setAttribute('aria-selected','false');
      const icon=document.createElement('span');icon.className='file-explorer-icon';icon.textContent='▱';icon.setAttribute('aria-hidden','true');const name=document.createElement('span');name.textContent='..';up.append(icon,name);up.onclick=()=>browse(parent);list.append(up);
    }
    const visible=entries.filter(e=>e.name.toLowerCase().includes(query)&&(e.directory||current.mode!=='folder'&&accepts(e.name)));
    for(const entry of visible){const row=document.createElement('button');row.type='button';row.className='file-explorer-entry';row.setAttribute('role','option');row.setAttribute('aria-selected',String(chosen===entry.path));
      const icon=document.createElement('span');icon.className='file-explorer-icon';icon.textContent=entry.directory?'▱':'♪';icon.setAttribute('aria-hidden','true');const name=document.createElement('span');name.textContent=entry.name;row.append(icon,name);
      row.onclick=()=>{chosen=entry.path;if(current.mode==='save'&&!entry.directory)$('[data-name]').value=entry.name;render();showPreview(entry);};
      row.ondblclick=()=>entry.directory?browse(entry.path):finish(entry.path);row.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();entry.directory?browse(entry.path):finish(entry.path);}};list.append(row);
    }
    if(!visible.length){const empty=document.createElement('p');empty.className='file-explorer-empty';empty.textContent=query?'No matching files.':'Nothing to show here.';list.append(empty);}
  }
  async function browse(path){clearPreview();const id=++version;$('[data-status]').textContent='Opening folder…';try{const result=await bridge.list(path);if(id!==version||!current)return;location=result.path;parent=result.parent;entries=result.entries;chosen='';$('[data-path]').value=location;$('[data-search]').value='';$('[data-status]').textContent='';$('[data-up]').disabled=location===parent;render();}catch{if(id===version)$('[data-status]').textContent='Couldn’t open this folder. Try another location.';}}
  async function finish(target){
    if(!current)return;
    if(current.mode==='folder')target=entries.find(e=>e.path===chosen&&e.directory)?.path||location;
    else if(!target){const entry=entries.find(e=>e.path===chosen);if(entry?.directory)return browse(entry.path);if(current.mode==='open')target=chosen;}
    if(current.mode==='save'){
      let name=$('[data-name]').value.trim();if(!name||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/^\.+$/.test(name)){$('[data-status]').textContent='Enter a filename.';return;}
      if(current.extension&&!name.toLowerCase().endsWith('.'+current.extension))name+='.'+current.extension;
      target=location+(location.includes('\\')?'\\':'/')+name;
    }
    if(!target){$('[data-status]').textContent='Choose a file first.';return;}
    $('[data-confirm]').disabled=true;try{if(await bridge.finish(current.id,target)){current=null;dialog.close();}}catch(error){$('[data-status]').textContent=error.message.replace(/^Error invoking remote method '[^']+': (Error: )?/,'');}finally{$('[data-confirm]').disabled=false;}
  }
  function cancel(){if(!current)return;clearPreview();bridge.finish(current.id,null);current=null;version++;dialog.close();}
  $('[data-close]').onclick=cancel;$('[data-cancel]').onclick=cancel;dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});
  let backdrop=false;const outside=event=>{const r=dialog.getBoundingClientRect();return event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom);};dialog.addEventListener('pointerdown',event=>backdrop=outside(event));dialog.addEventListener('click',event=>{if(backdrop&&outside(event))cancel();backdrop=false;});
  dialog.addEventListener('keydown',event=>event.stopPropagation());$('[data-up]').onclick=()=>browse(parent);$('[data-search]').oninput=render;$('[data-path-form]').onsubmit=event=>{event.preventDefault();browse($('[data-path]').value);};$('[data-confirm]').onclick=()=>finish();$('[data-name]').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();finish();}};
  $('[data-new]').onclick=()=>{$('[data-new-form]').hidden=!$('[data-new-form]').hidden;if(!$('[data-new-form]').hidden)$('[data-folder-name]').focus();};
  $('[data-new-form]').onsubmit=async event=>{event.preventDefault();try{await bridge.mkdir(location,$('[data-folder-name]').value);$('[data-new-form]').hidden=true;$('[data-folder-name]').value='';await browse(location);}catch{$('[data-status]').textContent='Couldn’t create that folder. Check its name and permissions.';}};
  bridge.onShow(async options=>{
    if(current)await bridge.finish(current.id,null);current=options;chosen='';entries=[];$('h2').textContent=options.title||'Choose a file';$('[data-confirm]').textContent=options.mode==='folder'?'Choose folder':options.mode==='save'?'Save':'Open';$('[data-name-label]').hidden=options.mode!=='save';$('[data-new-form]').hidden=true;$('[data-status]').textContent='';$('[data-list]').replaceChildren();dialog.showModal();
    const places=await bridge.places();if(current!==options)return;$('nav').replaceChildren();let group='';for(const place of places){if(place.group==='drives'&&group!=='drives'){const heading=document.createElement('span');heading.className='file-explorer-group';heading.textContent='Drives';$('nav').append(heading);}group=place.group||'';const b=document.createElement('button');b.type='button';b.textContent=place.name;b.dataset.location=place.path;b.onclick=()=>browse(place.path);$('nav').append(b);}
    let start=options.defaultPath||location||places.find(p=>p.name==='Downloads')?.path;if(options.mode==='save'&&options.defaultPath){const parts=options.defaultPath.split(/[/\\]/);$('[data-name]').value=parts.pop();start=parts.join(options.defaultPath.includes('\\')?'\\':'/')||location||places.find(p=>p.name==='Downloads')?.path;}
    await browse(start);
  });
  async function pick(input){
    if(input.disabled||current||picking)return;picking=true;
    try{const result=await bridge.pick({accept:input.accept});if(!result){input.dispatchEvent(new Event('cancel'));return;}
      const ext=result.name.split('.').pop().toLowerCase(),mime={mp3:'audio/mpeg',wav:'audio/wav',flac:'audio/flac',ogg:'audio/ogg',m4a:'audio/mp4',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'}[ext]||'';
      const file=new File([result.bytes],result.name,{type:mime,lastModified:result.modified});paths.set(file,await bridge.path(result.token));const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;paths.set(input.files[0],paths.get(file));input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
    }catch{input.dispatchEvent(new Event('cancel'));window.showToast?.('Could not open that file. Please try again.');}
    finally{picking=false;}
  }
  document.addEventListener('click',event=>{const input=event.target;if(input instanceof HTMLInputElement&&input.type==='file'){event.preventDefault();pick(input);}},true);
  window.FileExplorer={pick,pathForFile:file=>paths.get(file)||''};
})();
