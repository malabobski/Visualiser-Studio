(function(root){
 const tones={general:[[659.25,0,.14],[880,.09,.22]],achievement:[[523.25,0,.18],[659.25,.09,.18],[783.99,.18,.2],[1046.5,.28,.32]]};
 function unreadChanges(previous,conversations){return conversations.filter(c=>Number(c.unread||0)>(previous.get(c.person_id)||0));}
 if(typeof module==='object'&&module.exports){module.exports={tones,unreadChanges};return;}
 let context,resuming,pendingSound;
 function contextForSound(){try{const Audio=root.AudioContext||root.webkitAudioContext;if(!Audio)return null;if(!context||context.state==='closed')context=new Audio();return context;}catch{return null;}}
 function sound(kind){
  const ctx=contextForSound();if(!ctx)return;
  if(ctx.state!=='running'){pendingSound=kind;if(!resuming)resuming=ctx.resume().then(()=>{const next=pendingSound;pendingSound=null;resuming=null;if(next&&ctx.state==='running')sound(next);}).catch(()=>{resuming=null;});return;}
  const start=ctx.currentTime+.015;
  for(const [frequency,offset,duration]of tones[kind]||tones.general){const oscillator=ctx.createOscillator(),gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start+offset);gain.gain.linearRampToValueAtTime(.075,start+offset+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+offset+duration);oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start(start+offset);oscillator.stop(start+offset+duration+.02);oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};}
 }
 const unlock=()=>{const ctx=contextForSound();if(ctx?.state==='suspended')ctx.resume().catch(()=>{});};
 document.addEventListener('pointerdown',unlock,{capture:true,once:true});document.addEventListener('keydown',unlock,{capture:true,once:true});
 const notice=document.createElement('aside');notice.id='achievementNotice';notice.className='achievement-notice';notice.popover='manual';notice.setAttribute('aria-label','Notification');
 notice.innerHTML='<button id="achievementNoticeOpen" type="button"><span aria-hidden="true">✦</span><span><small>Notification</small><strong id="achievementNoticeName" role="status"></strong></span></button><button id="achievementNoticeDismiss" type="button" aria-label="Dismiss notification">×</button><span class="notification-timer" aria-hidden="true"></span>';
 document.body.append(notice);let queue=[],active=null,timer,closeTimer,remaining=0,started=0,closing=false;
 const reduced=()=>document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
 function resume(){if(!active||closing)return;notice.classList.remove('is-paused');started=performance.now();clearTimeout(timer);timer=setTimeout(leave,remaining);}
 function pause(){if(!active||closing||notice.classList.contains('is-paused'))return;clearTimeout(timer);remaining=Math.max(0,remaining-(performance.now()-started));notice.classList.add('is-paused');}
 function showNext(){
  clearTimeout(timer);clearTimeout(closeTimer);closing=false;notice.classList.remove('is-leaving','is-paused');active=queue.shift()||null;if(!active)return;
  const copy=document.getElementById('achievementNoticeOpen');copy.querySelector('span:first-child').textContent=active.symbol||'◈';copy.querySelector('small').textContent=active.title||'Visualiser Studio';document.getElementById('achievementNoticeName').textContent=active.message||'';notice.setAttribute('aria-label',active.title||'Notification');
  remaining=Math.max(1000,Math.min(30000,Number(active.duration)||5500));notice.style.setProperty('--notice-duration',remaining+'ms');const progress=notice.querySelector('.notification-timer');progress.style.animation='none';void progress.offsetWidth;progress.style.animation='';notice.showPopover();resume();if(document.hidden)pause();if(!active.soundPlayed)sound(active.achievement?'achievement':'general');root.dispatchEvent(new CustomEvent('notification-shown',{detail:{kind:active.achievement?'achievement':'general',title:active.title,group:active.group}}));
 }
 function leave(){if(!active||closing)return;clearTimeout(timer);closing=true;notice.classList.add('is-leaving');const finish=()=>{notice.hidePopover();active=null;showNext();};if(reduced())finish();else closeTimer=setTimeout(finish,190);}
 function show(item){if(!item||!item.message)return;item={...item,soundPlayed:false};if(document.hidden){sound(item.achievement?'achievement':'general');item.soundPlayed=true;}if(item.key){queue=queue.filter(n=>n.key!==item.key);if(active?.key===item.key){queue.unshift(item);leave();return;}}queue.push(item);if(!active&&!closing)showNext();}
 function clearWhere(test){queue=queue.filter(item=>!test(item));if(active&&test(active))leave();}
 document.getElementById('achievementNoticeOpen').onclick=()=>{const item=active;leave();item?.onClick?.();};document.getElementById('achievementNoticeDismiss').onclick=leave;
 notice.addEventListener('pointerenter',pause);notice.addEventListener('pointerleave',()=>{if(!notice.contains(document.activeElement))resume();});notice.addEventListener('focusin',pause);notice.addEventListener('focusout',e=>{if(!notice.contains(e.relatedTarget)&&!notice.matches(':hover'))resume();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(!notice.matches(':hover')&&!notice.contains(document.activeElement))resume();});
 root.AppNotifications={show,clear:group=>clearWhere(n=>n.group===group),clearAchievements:()=>clearWhere(n=>!!n.achievement),unreadChanges};
})(typeof window==='undefined'?globalThis:window);
