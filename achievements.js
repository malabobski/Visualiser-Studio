(function(root){
  const diamondMessages = [
    'Hi!!', 'I love you!', 'You found me!', 'Hello, lovely human!',
    'A tiny hello, just for you.', 'Sending you a little sparkle ✨',
    'You make this place brighter.', 'Secret diamond reporting for duty!',
    'Boop!', 'Good to see you again!', 'Your music taste? Excellent.',
    'Stay a little. Have a dance.', 'A hug, in pixel form.',
    'You clicked! I sparkled!', 'This is our little secret.',
    'Hope your day has a good soundtrack.', 'You deserve a good day.',
    'Tiny diamond. Big feelings.', 'Keep being you.', 'Hey, superstar!',
    'Fancy seeing you here!', 'You bring the music. I bring the sparkle.',
    'One complimentary smile :)', 'I was hoping you would click me.',
    'There you are!', 'Little button, lots of love.', 'Made you look!',
    'You are the main character today.', 'Hydration break?',
    'Relax your shoulders. Enjoy the music.', 'Another song? Go on.',
    'Sending good vibes your way.', 'This beat looks good on you.',
    'A secret handshake, but with pixels.', 'You have unlocked: absolutely nothing ♥',
    'Shh… the diamond is awake.', 'Hello from the tiny corner!',
    'Keep the good tunes coming.', 'Thanks for hanging out with me.',
    'You found the happy button!', 'A little joy between songs.',
    'Have you smiled today?', 'Looking sharp!', 'I believe in you.',
    'The pixels are pleased.', 'You + music = a good time.',
    'Sending one very small high five.', 'Glad you are here.',
    'Press play on a nice day.', 'Okay, one more sparkle ✨', 'Sparkles!!!!!!',
    'You found the party!', 'Shh… secret mode.', 'The pixels are dancing.',
    'Disco diamond!', 'A shooting star!', 'Rare diamond discovered!',
    'You again? ♥', 'Make a wish.', 'Secret handshake accepted.'
  ];
  const secrets = [
    ['diamond-messages','Diamond conversations','A small shape has a lot to say.'],
    ['cheat-code','Old-school magic','input a cheat code somewhere..'],
    ['rare-diamond','Rare diamond','Some little things have a golden side.'],
    ['alive','Alive','A familiar heading might have a little more life in it.'],
    ['disco-preset','A secret dancefloor','Sometimes going back to the beginning is worth repeating.'],
    ['sparkles','A little sparkle','Keep talking to the tiny shape. It might get excited.'],
    ['party','Pixel party','An unexpected invitation might arrive in a tiny conversation.'],
    ['moon','After dark','Even a diamond needs a quieter side.'],
    ['boop','Boop','A small hello might have a little bounce.'],
    ['dancing','Dancing pixels','The little shape knows how to get the neighbours moving.'],
    ['disco-diamond','Disco diamond','There might be a dancefloor in the corner, too.'],
    ['shooting-star','Passing light','Watch the corner. Something might pass by.'],
    ['wish','Wish upon a pixel','Some tiny conversations are best had under the stars.'],
    ['nothing','Absolutely nothing','Not every tiny reward has to mean something.'],
    ['handshake','A quiet password','A little sparkle can be spelled out, even in a name.'],
    ['diamond-handshake','A secret greeting','A tiny conversation might end with a familiar gesture.'],
    ['record','Hidden in the silence','An idle Live player still has something to play with.'],
    ['art-record','A record without a cover','No artwork? There might still be something to touch.'],
    ['sleep','Sleepy pixels','Let a song rest for a little while.'],
    ['credits','Behind the pixels','A little version of the story has a longer one behind it.'],
    ['returning','You again?','Familiar faces are remembered, every so often.'],
    ['hundred-exports','A hundred little worlds','Keep turning your ideas into something you can take away.']
  ].map(([id,name,hint])=>({id,name,hint}));
  const messageSecrets = {
    'Sparkles!!!!!!':'sparkles', 'You found the party!':'party', 'Shh… secret mode.':'moon',
    'Boop!':'boop', 'The pixels are dancing.':'dancing', 'Disco diamond!':'disco-diamond',
    'A shooting star!':'shooting-star', 'Make a wish.':'wish', 'Rare diamond discovered!':'rare-diamond',
    'You have unlocked: absolutely nothing ♥':'nothing', 'Secret handshake accepted.':'diamond-handshake'
  };
  const key='visualiserAchievements-v1';
  function createTracker(storage,onChange=()=>{}){
    const ids=new Set(secrets.map(s=>s.id)),knownMessages=new Set(diamondMessages);
    let saved,raw;try{raw=storage.getItem(key);saved=JSON.parse(raw||'{}');}catch{}
    const firstUse=raw==null;
    const seen=new Set((Array.isArray(saved?.messages)?saved.messages:[]).filter(m=>knownMessages.has(m)));
    const unlocked=new Set((Array.isArray(saved?.unlocked)?saved.unlocked:[]).filter(id=>ids.has(id)));
    function snapshot(){return {messages:[...seen],unlocked:[...unlocked]};}
    function persist(newly=[]){let stored=true;try{storage.setItem(key,JSON.stringify(snapshot()));}catch{stored=false;}onChange(snapshot(),stored,newly);}
    function unlock(id){if(!ids.has(id)||unlocked.has(id))return false;unlocked.add(id);persist([id]);return true;}
    function recordMessage(message){
      if(!knownMessages.has(message))return false;
      let changed=false;const before=new Set(unlocked);
      if(!seen.has(message)){seen.add(message);changed=true;}
      const id=messageSecrets[message];if(id&&!unlocked.has(id)){unlocked.add(id);changed=true;}
      if(message.includes('sparkle')&&!unlocked.has('sparkles')){unlocked.add('sparkles');changed=true;}
      if(seen.size===knownMessages.size&&!unlocked.has('diamond-messages')){unlocked.add('diamond-messages');changed=true;}
      if(changed)persist([...unlocked].filter(id=>!before.has(id)));return changed;
    }
    for(const message of seen){if(messageSecrets[message])unlocked.add(messageSecrets[message]);}
    if(seen.size===knownMessages.size)unlocked.add('diamond-messages');
    function reset(){seen.clear();unlocked.clear();persist();}
    return {snapshot,unlock,recordMessage,reset,firstUse};
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={createTracker,diamondMessages,secrets,key};return;}
  let render=()=>{},notify=()=>{},notificationsReady=false;
  const tracker=createTracker({getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},(_state,_stored,newly)=>{render();if(notificationsReady)newly.forEach(notify);});
  root.Achievements={...tracker,diamondMessages};
  window.addEventListener('diamond-surprise',event=>tracker.recordMessage(event.detail));
  window.addEventListener('disco-unlocked',()=>tracker.unlock('disco-preset'));
  function setup(){
    const help=document.getElementById('restartTutorial')?.closest('.settings-group');if(!help)return;
    const row=document.createElement('div');row.className='settings-row';
    row.innerHTML='<button id="showAchievements" class="menu-default" type="button">✦ Achievements</button><small>A little collection of the secrets you’ve found.</small>';help.append(row);
    const dialog=document.createElement('dialog');dialog.id='achievementsDialog';dialog.className='record-dialog achievements-dialog';dialog.setAttribute('aria-labelledby','achievementsTitle');
    dialog.innerHTML='<div class="record-heading"><div><p class="eyebrow">LITTLE DISCOVERIES</p><h2 id="achievementsTitle">Achievements</h2><p id="achievementsSummary" aria-live="polite"></p></div><button id="achievementsClose" type="button" aria-label="Close achievements">×</button></div><div class="achievements-list"></div><div class="achievements-footer"><p>Hover or focus a card for a little nudge.</p><button id="achievementsReset" type="button">Reset progress</button></div><div id="achievementsResetConfirm" class="achievements-reset-confirm" hidden><span>Reset every discovery and the diamond counter?</span><button id="achievementsResetCancel" type="button">Keep them</button><button id="achievementsResetAccept" type="button">Reset</button></div>';
    const list=dialog.querySelector('.achievements-list'),cards=new Map();
    for(const secret of secrets){
      const card=document.createElement('button');card.type='button';card.className='achievement-card';card.dataset.achievement=secret.id;
      card.setAttribute('aria-describedby','achievement-hint-'+secret.id);
      card.innerHTML='<span class="achievement-symbol" aria-hidden="true">◇</span><span class="achievement-copy"><strong></strong><span class="achievement-status"></span></span><span class="achievement-progress"></span><span class="achievement-hint" role="tooltip"></span>';
      card.querySelector('strong').textContent=secret.name;const hint=card.querySelector('.achievement-hint');hint.id='achievement-hint-'+secret.id;hint.textContent=secret.hint;
      card.onfocus=()=>card.classList.add('hint-visible');card.onblur=()=>card.classList.remove('hint-visible');
      card.onclick=()=>card.classList.add('hint-visible');cards.set(secret.id,card);list.append(card);
    }
    document.body.append(dialog);
    render=()=>{
      const state=tracker.snapshot();
      document.getElementById('achievementsSummary').textContent=state.unlocked.length+' / '+secrets.length+' discovered';
      for(const secret of secrets){const card=cards.get(secret.id),found=state.unlocked.includes(secret.id);card.classList.toggle('is-complete',found);card.querySelector('.achievement-symbol').textContent=found?'✦':'◇';card.querySelector('.achievement-status').textContent=found?'Discovered':'Still a secret';card.querySelector('.achievement-progress').textContent=secret.id==='diamond-messages'?state.messages.length+' / '+diamondMessages.length:found?'✓':'—';}
    };
    const trigger=document.getElementById('showAchievements');let previousFocus;
    function open(id){render();if(!dialog.open){previousFocus=document.activeElement;dialog.showModal();}const card=cards.get(id);if(card){card.scrollIntoView({block:'center',behavior:'instant'});card.focus();}}
    trigger.onclick=()=>open();
    document.getElementById('achievementsClose').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{document.getElementById('achievementsResetConfirm').hidden=true;(previousFocus?.isConnected?previousFocus:trigger).focus();});
    dialog.addEventListener('click',event=>{const rect=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom))dialog.close();});
    // Restore discoveries that older builds recorded as durable evidence.
    if(tracker.firstUse)try{if(loadTemplates().some(t=>t.id==='secret-disco'))tracker.unlock('disco-preset');if(Number(localStorage.getItem('visualiserCompletedExports'))>=100)tracker.unlock('hundred-exports');}catch{}
    const notice=document.createElement('aside');notice.id='achievementNotice';notice.className='achievement-notice';notice.setAttribute('popover','manual');notice.setAttribute('aria-label','Achievement unlocked');
    notice.innerHTML='<button id="achievementNoticeOpen" type="button"><span aria-hidden="true">✦</span><span><small>Achievement unlocked</small><strong id="achievementNoticeName" role="status"></strong></span></button><button id="achievementNoticeDismiss" type="button" aria-label="Dismiss achievement notification">×</button>';document.body.append(notice);
    let queue=[],active=null,timer;
    function next(){clearTimeout(timer);notice.hidePopover();active=queue.shift()||null;if(!active)return;document.getElementById('achievementNoticeName').textContent=secrets.find(secret=>secret.id===active).name;notice.showPopover();timer=setTimeout(next,5500);}
    notify=id=>{queue.push(id);if(!active)next();};
    document.getElementById('achievementNoticeOpen').onclick=()=>{const id=active;next();open(id);};
    document.getElementById('achievementNoticeDismiss').onclick=next;
    document.getElementById('achievementsReset').onclick=()=>{document.getElementById('achievementsResetConfirm').hidden=false;document.getElementById('achievementsResetCancel').focus();};
    document.getElementById('achievementsResetCancel').onclick=()=>{document.getElementById('achievementsResetConfirm').hidden=true;document.getElementById('achievementsReset').focus();};
    document.getElementById('achievementsResetAccept').onclick=()=>{queue=[];active=null;clearTimeout(timer);notice.hidePopover();tracker.reset();try{localStorage.removeItem('visualiserCompletedExports');localStorage.removeItem('visualiserDiamondVisits');}catch{}window.dispatchEvent(new Event('achievements-reset'));document.getElementById('achievementsResetConfirm').hidden=true;document.getElementById('achievementsReset').focus();};
    notificationsReady=true;
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})(typeof window==='undefined'?globalThis:window);
