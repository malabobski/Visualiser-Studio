(() => {
 const bridge=window.community,ui=window.CommunityUI,roles=window.CommunityRoles,screen=document.getElementById('screen-community');if(!bridge?.adminStatus||!ui||!roles)return;
 let admin=false,account=null,busy=false;const shown=new Set(),el=id=>document.getElementById('community'+id);
 const tools=window.CommunityAdminTools.create({parent:screen,invoke:value=>bridge.admin(value),confirm:ui.confirm,changed:async()=>{window.dispatchEvent(new Event('community-feed-refresh'));await refreshBadges();}});
 const open=document.createElement('button');open.type='button';open.textContent='Creator tools';open.hidden=true;open.className='community-creator-tools';open.onclick=()=>tools.open();el('ShareActivity').closest('label').after(open);
 const notices=document.createElement('div');notices.className='community-notification-panel';notices.hidden=true;el('Feed').querySelector('header').after(notices);
 const markNames=()=>{
  const state=ui.get();if(state.profile?.username){roles.mark(el('AccountName'),state.profile.username);roles.mark(el('Name'),state.profile.username);}
 };
 async function refreshBadges(){if(!account)return;markNames();const names=[...new Set([...document.querySelectorAll('[data-role-username]')].map(n=>n.dataset.roleUsername))];
  const id=account;for(let i=0;i<names.length;i+=100){const result=await bridge.badges(names.slice(i,i+100));if(account!==id)return;if(!result.error)roles.update(result.badges);}
 }
 async function loadNotifications(){
  if(!account)return;const id=account,result=await bridge.notifications();if(id!==account||result.error)return;
  const items=result.notifications||[];notices.hidden=!items.length;
  const existing=new Map([...notices.children].map(n=>[n.dataset.id,n]));
  for(const notification of items){if(!existing.has(notification.id)){
    const card=document.createElement('article');card.dataset.id=notification.id;const title=document.createElement('h4'),body=document.createElement('p'),dismiss=document.createElement('button');title.textContent=notification.title;body.textContent=notification.body;dismiss.textContent='Dismiss';dismiss.type='button';
    dismiss.onclick=async()=>{const result=await bridge.acknowledgeNotifications([notification.id]);if(!result.error){card.remove();notices.hidden=!notices.children.length;}};card.append(title,body,dismiss);notices.append(card);
   }
   if(!shown.has(notification.id)&&window.AppNotifications?.show){shown.add(notification.id);window.AppNotifications.show({group:'community-admin:'+id,title:notification.title,message:notification.body,symbol:'♛',duration:8000,onClick:()=>{if(id!==account)return;document.querySelector('[data-screen="community"]')?.click();notices.scrollIntoView({block:'nearest',behavior:document.body.classList.contains('reduce-motion')?'instant':'smooth'});}});}
  }
  const keep=new Set(items.map(n=>n.id));for(const [id,card]of existing)if(!keep.has(id))card.remove();
 }
 async function refresh(){if(!account||busy)return;busy=true;const id=account;try{const result=await bridge.adminStatus();if(id!==account)return;const changed=admin!==!!result.admin;admin=!result.error&&!!result.admin;open.hidden=!admin;if(changed)window.dispatchEvent(new Event('community-admin-changed'));await refreshBadges();await loadNotifications();}finally{busy=false;}}
 window.CommunityModeration={isAdmin:()=>admin,postControls:post=>tools.postControls(post),mark:(target,username)=>roles.mark(target,username),verifyAccount:async(username,verified)=>{
  if(!admin)return {error:'Only the creator can change verification.'};const result=await bridge.admin({action:'verify',username,verified});if(!result.error)await refreshBadges();return result;
 }};
 async function changed(state){const id=state.signedIn?state.accountId:null;if(id!==account){if(account)window.AppNotifications?.clear?.('community-admin:'+account);account=id;admin=false;open.hidden=true;shown.clear();notices.replaceChildren();notices.hidden=true;tools.close();roles.clear();window.dispatchEvent(new Event('community-admin-changed'));}if(id)await refresh();}
 window.addEventListener('community-account',e=>changed(e.detail));window.addEventListener('community-friends-rendered',()=>refreshBadges());window.addEventListener('community-posts-rendered',()=>refreshBadges());
 setInterval(refresh,30000);window.addEventListener('focus',refresh);changed(ui.get());
})();
