(() => {
  const bridge=window.community,ui=window.CommunityUI,screen=document.getElementById('screen-community');if(!bridge||!ui||!screen)return;
  const el=name=>document.getElementById('community'+name);
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const button=(text,click,cls)=>{const n=node('button',text,cls);n.type='button';n.onclick=click;return n;};
  let account=null,sharing=false,activities=new Map(),person=null,profileToken=0,chatToken=0,peer=null,chatLoading=false,sending=false,ticking=false,settingsLoaded=false;
  const personDialog=node('dialog',undefined,'community-profile-dialog community-person-dialog');personDialog.setAttribute('aria-label','User’s corner');screen.append(personDialog);
  const messages=node('dialog',undefined,'community-profile-dialog community-messages-dialog');messages.setAttribute('aria-label','Direct messages');
  messages.innerHTML='<div class="community-card community-messages-shell"><div class="community-messages-top"><div><p class="eyebrow">JUST BETWEEN FRIENDS</p><h2>Messages</h2></div><button type="button" aria-label="Close messages">×</button></div><p class="community-dm-privacy">Unread messages expire after 30 days. Opened messages stay on this computer. History won’t follow you to another device.</p><div class="community-messages-layout"><aside aria-label="Conversations"></aside><div class="community-conversation"><h3>Choose a conversation</h3><div class="community-message-list" aria-label="Message history"></div><form novalidate hidden><label>Message<textarea maxlength="2000" rows="2" placeholder="Say something…"></textarea></label><div><span>0 / 2000</span><button type="submit" class="community-primary">Send</button></div></form></div></div><p class="community-message-status" role="status"></p></div>';
  screen.append(messages);const list=messages.querySelector('.community-message-list'),chatForm=messages.querySelector('form'),body=chatForm.querySelector('textarea'),chatStatus=messages.querySelector('[role=status]'),chatHeading=messages.querySelector('h3');
  const inboxButton=button('Messages',()=>openMessages(),'community-inbox-button');el('FriendsRefresh').before(inboxButton);
  const messageCount=node('span','','community-message-count');messageCount.hidden=true;inboxButton.append(messageCount);let unreadBefore=new Map(),readingInbox=false;
  const syncMessagesButton=()=>{inboxButton.hidden=ui.friendTab?.()!=='friends';};window.addEventListener('community-tab-changed',syncMessagesButton);syncMessagesButton();
  function closeDialog(dialog){dialog.classList.remove('is-closing');dialog.close();}
  function bindClose(dialog,close){dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});}
  const closeMessages=()=>{chatToken++;peer=null;closeDialog(messages);};
  messages.querySelector('[aria-label="Close messages"]').onclick=closeMessages;
  bindClose(messages,closeMessages);bindClose(personDialog,()=>{profileToken++;closeDialog(personDialog);});
  function paintActivity(){for(const row of screen.querySelectorAll('.community-person[data-person-id]')){const label=row.querySelector('.community-person-activity');if(!label)continue;const activity=activities.get(row.dataset.personId)||'Activity not shared';if(label.textContent!==activity)label.textContent=activity;label.classList.toggle('is-sharing',activities.has(row.dataset.personId));}}
  window.addEventListener('community-friends-rendered',paintActivity);
  function description(){
    if(typeof exporting!=='undefined'&&exporting)return 'Exporting a visualiser video';
    if(typeof desktopMedia!=='undefined'&&desktopMedia?.title&&desktopMedia.playbackStatus==='Playing')return ('Listening to '+desktopMedia.title+(desktopMedia.artist?' · '+desktopMedia.artist:'')).slice(0,180);
    if(typeof liveActive!=='undefined'&&liveActive)return 'Visualising live audio';
    if(!screen.hidden)return 'Hanging out in Community';
    if(!document.getElementById('screen-templates').hidden)return 'Browsing templates';
    if(!document.querySelector('main').hidden)return 'Creating a visualiser';
    return 'Hanging out with music';
  }
  async function inbox(){
    const id=account;if(!id||readingInbox)return;readingInbox=true;let result;try{result=await bridge.dmInbox();}finally{readingInbox=false;}if(account!==id)return;
    if(result.error){if(messages.open)chatStatus.textContent=result.error;return;}
    const conversations=result.conversations||[],unread=conversations.reduce((sum,c)=>sum+Number(c.unread||0),0);
    messageCount.textContent=unread>99?'99+':unread;messageCount.hidden=!unread;ui.setUnreadMessages?.(unread);inboxButton.setAttribute('aria-label','Messages'+(unread?', '+unread+' unread':''));
    const changes=window.AppNotifications?.unreadChanges?.(unreadBefore,conversations)||[];unreadBefore=new Map(conversations.map(c=>[c.person_id,Number(c.unread||0)]));
    for(const chat of changes){if(messages.open&&peer?.username===chat.username&&!document.hidden&&!screen.hidden)continue;window.AppNotifications?.show({key:'dm:'+id+':'+chat.person_id,group:'community-dm:'+id,title:'Message from '+chat.display_name,message:Number(chat.unread)===1?'You have a new message.':chat.unread+' unread messages. Click to open the conversation.',symbol:'✉',duration:7000,onClick:()=>{if(id!==account)return;document.querySelector('[data-screen="community"]')?.click();ui.selectFriendTab?.('friends');openMessages(chat.username);}});}
    if(result.warning&&messages.open)chatStatus.textContent=result.warning;
    const aside=messages.querySelector('aside'),snapshot=JSON.stringify(conversations);
    if(aside.dataset.snapshot!==snapshot){aside.dataset.snapshot=snapshot;aside.replaceChildren();for(const c of conversations){const b=button('',()=>openChat(c.username));b.dataset.username=c.username;b.append(node('strong',c.display_name),node('small','@'+c.username+(Number(c.unread)?' · '+c.unread+' new':'')));aside.append(b);}if(!conversations.length)aside.append(node('p','Open a friend’s corner to start a conversation.'));}
    aside.querySelectorAll('button').forEach(b=>b.classList.toggle('is-active',b.dataset.username===peer?.username));
  }
  function paintMessages(history){
    const stick=list.scrollHeight-list.scrollTop-list.clientHeight<60,existing=new Map([...list.children].map(n=>[n.dataset.id,n]));
    for(const message of history){let row=existing.get(message.id);const snapshot=JSON.stringify(message);
      if(row?.dataset.snapshot===snapshot)continue;
      const fresh=node('article',undefined,'community-message '+(message.direction==='outgoing'?'is-own':''));fresh.dataset.id=message.id;fresh.dataset.snapshot=snapshot;
      fresh.append(node('p',message.body));const date=new Date(message.created_at);fresh.append(node('small',date.toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})+(message.status==='pending'?' · Not sent':' ')));
      if(message.status==='pending')fresh.append(button('Retry',()=>send(message.id,message.body)));
      if(row)row.replaceWith(fresh);else list.append(fresh);
    }
    const keep=new Set(history.map(m=>m.id));for(const child of [...list.children])if(!keep.has(child.dataset.id))child.remove();
    if(stick)list.scrollTop=list.scrollHeight;
  }
  async function openChat(username,quiet=false){
    if(chatLoading||sending)return;const id=account,token=++chatToken;chatLoading=true;
    if(!quiet){if(peer?.username!==username){body.value='';chatForm.querySelector('span').textContent='0 / 2000';list.replaceChildren();peer=null;}chatHeading.textContent='Opening conversation…';chatForm.hidden=true;chatStatus.textContent='';}
    try{const result=await bridge.dmOpen(username);if(token!==chatToken||id!==account||!messages.open)return;if(result.error)throw Error(result.error);
      peer=result.peer;chatHeading.replaceChildren(button(peer.display_name+' · @'+peer.username,()=>ui.openPerson(peer.username)));
      paintMessages(result.messages);chatForm.hidden=false;chatForm.querySelector('button').disabled=peer.relationship?.status!=='accepted'||peer.blocked===true;
      chatStatus.textContent=result.warning|| (peer.relationship?.status==='accepted'?'':'You can read saved history. Add this person as a friend to send messages.');
      await inbox();
    }catch(error){if(token===chatToken){chatStatus.textContent=error.message;chatHeading.textContent=quiet?chatHeading.textContent:'Couldn’t open this conversation';}}
    finally{chatLoading=false;}
  }
  async function openMessages(username){if(!account)return;if(personDialog.open)closeDialog(personDialog);if(!messages.open)messages.showModal();await inbox();if(username)await openChat(username);}
  async function send(retryId,original){
    if(sending||chatLoading||!peer)return;const text=String(original??body.value).trim();if(!text){chatStatus.textContent='Write a message first.';body.focus();return;}
    const id=account,name=peer.username,draft=body.value;sending=true;chatForm.querySelector('button').disabled=true;
    try{const result=await bridge.dmSend({username:name,body:text,...(retryId?{retryId}:{})});if(account!==id)return;
      if(!result.id&&result.error)throw Error(result.error);if(!result.error)window.Achievements?.unlock('social-message');if(!retryId&&body.value===draft)body.value='';chatForm.querySelector('span').textContent=body.value.length+' / 2000';
      sending=false;await openChat(name,true);if(result.error)chatStatus.textContent=result.error;
    }catch(error){chatStatus.textContent=error.message;}finally{sending=false;chatForm.querySelector('button').disabled=peer?.relationship?.status!=='accepted';}
  }
  body.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.isComposing){event.preventDefault();event.stopPropagation();if(!chatForm.querySelector('button').disabled)chatForm.requestSubmit();}});
  chatForm.querySelector('button').dataset.hint='Send message · Enter (Shift+Enter for a new line)';
  chatForm.onsubmit=e=>{e.preventDefault();send();};body.oninput=()=>{chatForm.querySelector('span').textContent=body.value.length+' / 2000';};
  async function openPerson(username){
    if(username===ui.get().profile?.username){ui.openSelf();return;}const token=++profileToken;
    person=null;personDialog.replaceChildren();const card=node('div',undefined,'community-card'),heading=node('div',undefined,'community-profile-heading');
    heading.append(node('div','◈','community-avatar'),node('h2','Opening their corner…'),button('×',()=>{profileToken++;closeDialog(personDialog);}));card.append(heading);personDialog.append(card);if(!personDialog.open)personDialog.showModal();
    const result=await bridge.person(username);if(token!==profileToken||!personDialog.open)return;
    if(result.error){card.append(node('p',result.error));return;}person=result.person;
    heading.querySelector('h2').textContent=person.display_name+'’s corner';heading.querySelector('.community-avatar').textContent=person.display_name.slice(0,1).toUpperCase();
    window.CommunityRoles?.mark(heading.querySelector('h2'),person.username);window.dispatchEvent(new Event('community-posts-rendered'));
    card.append(node('p','@'+person.username,'community-corner-username'),node('p',person.bio||'A little mystery. A lot of music.','community-corner-bio'));
    if(person.activity)card.append(node('p',person.activity,'community-person-activity is-sharing'));
    const actions=node('div',undefined,'community-corner-actions'),rel=person.relationship;
    const run=async(fn)=>{const response=await fn();if(response.error){card.append(node('p',response.error));return;}await ui.refreshFriends?.();await openPerson(username);};
    if(person.blocked)actions.append(button('Unblock',()=>run(()=>bridge.blockPerson({id:person.id,blocked:false}))));
    else if(rel?.status==='accepted'){actions.append(node('span','Friends','community-person-tag'),button('Message',()=>openMessages(username),'community-primary'));}
    else if(rel?.direction==='incoming')actions.append(button('Accept request',()=>run(()=>bridge.friendAction({id:rel.id,action:'accept'})),'community-primary'));
    else if(rel)actions.append(button('Cancel request',()=>run(()=>bridge.friendAction({id:rel.id,action:'cancel'}))));
    else actions.append(button('Add friend',()=>run(()=>bridge.sendRequest(username)),'community-primary'));
    if(window.CommunityModeration?.isAdmin()){
      const verified=window.CommunityRoles?.get(person.username)?.verified===true;
      const verify=button(verified?'Remove checkmark':'Add checkmark',async()=>{
        verify.disabled=true;
        try{const response=await window.CommunityModeration.verifyAccount(person.username,!verified);if(response.error){card.append(node('p',response.error));return;}await openPerson(username);}
        finally{verify.disabled=false;}
      });verify.classList.add('community-verify-account');actions.append(verify);
    }
    if(!person.blocked)actions.append(button('Block',async()=>{if(!await ui.confirm('Block @'+username+'?','This removes your friendship and stops new requests and messages. Saved local history stays on this computer.','Block'))return;await run(()=>bridge.blockPerson({id:person.id,blocked:true}));}));
    card.append(actions);
  }
  ui.openPerson=openPerson;
  el('ShareActivity').addEventListener('change',async()=>{const id=account,value=el('ShareActivity').checked;el('ShareActivity').disabled=true;
    const result=await bridge.setActivity({sharing:value,activity:description()});if(id!==account)return;
    if(result.error){el('ProfileStatus').textContent=result.error;el('ShareActivity').checked=sharing;}else sharing=value;el('ShareActivity').disabled=false;
  });
  async function accountChanged(state){
    const id=state.signedIn?state.accountId:null;if(id===account)return;if(account)window.AppNotifications?.clear?.('community-dm:'+account);account=id;unreadBefore=new Map();ui.setUnreadMessages?.(0);messageCount.hidden=true;messageCount.textContent='';sharing=false;settingsLoaded=false;activities.clear();paintActivity();el('ShareActivity').checked=false;el('ShareActivity').disabled=true;
    profileToken++;chatToken++;peer=null;list.replaceChildren();body.value='';messages.querySelector('aside').replaceChildren();delete messages.querySelector('aside').dataset.snapshot;closeDialog(messages);closeDialog(personDialog);
    if(!id)return;const result=await bridge.socialSettings();if(account!==id)return;
    if(result.error){el('ProfileStatus').textContent=result.error;return;}settingsLoaded=true;sharing=result.sharing;el('ShareActivity').checked=sharing;el('ShareActivity').disabled=false;tick();
  }
  async function tick(){
    if(!account||ticking||!settingsLoaded)return;ticking=true;const id=account;
    try{
      if(sharing)await bridge.setActivity({sharing:true,activity:description()});
      if(account!==id)return;const result=await bridge.friendActivity();if(account!==id)return;if(!result.error){activities=new Map((result.activities||[]).map(a=>[a.person_id,a.activity]).filter(([,a])=>a));paintActivity();}
      await inbox();if(messages.open&&peer&&!document.hidden&&!sending)await openChat(peer.username,true);
    }finally{ticking=false;}
  }
  window.addEventListener('community-account',event=>accountChanged(event.detail));accountChanged(ui.get());
  setInterval(tick,30000);window.addEventListener('focus',tick);
  new MutationObserver(()=>{if(screen.hidden){closeMessages();closeDialog(personDialog);}}).observe(screen,{attributes:true,attributeFilter:['hidden']});
})();
