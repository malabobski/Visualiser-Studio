/* WEBSITE COMMUNITY JS START */
(() => {
  const PROJECT_URL='https://hmofmufudjbgyvgeafwm.supabase.co';
  const KEY='sb_publishable_lZCJGmDSNzMOQbfTlLRkZA_NlG3bmuR'; // Public project key; RLS controls access.
  const SITE='https://malchim.malabobski.workers.dev/';
  const el=id=>document.getElementById('wc'+id), section=document.getElementById('community');
  const styleNames={bars:'Bars',mirror:'Mirror',radial:'Radial',wave:'Waveform',particles:'Particles',aurora:'Aurora',orbit:'Orbit',rings:'Rings',spiral:'Spiral',grid:'Grid',starburst:'Starburst',tunnel:'Tunnel',prism:'Shatterfield',city:'Bass surf',notes:'Note trails'};
  let client,user=null,profile=null,posts=[],pending=[],scope='everyone',loaded=false,hasMore=false,loading=false,writing=false,epoch=0,accountEpoch=0,accountId,confirmResolve,admin=false;
  let notified=new Set();
  const text=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
  const button=(label,run,cls='wc-text-button')=>{const n=text('button',label,cls);n.type='button';n.addEventListener('click',run);return n;};
  function status(message='',retry=false){el('Status').textContent=message;el('Retry').hidden=!retry;}
  function errorMessage(error){
    if(['PGRST202','42P01','PGRST205'].includes(error?.code))return 'Community is being set up. Please try again shortly.';
    if(error?.code==='23505')return 'That username is already taken. Try another.';
    if(error?.code==='P0001')return error.message;
    return 'Couldn’t connect to Community. Check your connection and try again.';
  }
  function controls(){
    el('Post').disabled=writing;el('SaveProfile').disabled=writing;
    el('Google').disabled=writing;el('Discord').disabled=writing;
    el('Logout').disabled=writing;
  }
  async function rpc(name,input){const {data,error}=await client.rpc(name,input);if(error)throw error;return data;}
  function confirm(title,body,label,cancel='Cancel'){
    if(el('Confirm').open)return Promise.resolve(false);
    el('ConfirmTitle').textContent=title;el('ConfirmText').textContent=body;
    el('ConfirmAccept').textContent=label;el('ConfirmCancel').textContent=cancel;
    el('Confirm').classList.remove('wc-closing');el('Confirm').showModal();el('ConfirmCancel').focus();
    return new Promise(resolve=>{confirmResolve=resolve;});
  }
  function endConfirm(accepted){
    if(!confirmResolve||el('Confirm').classList.contains('wc-closing'))return;
    const finish=()=>{el('Confirm').close();el('Confirm').classList.remove('wc-closing');const resolve=confirmResolve;confirmResolve=null;resolve(accepted);};
    if(matchMedia('(prefers-reduced-motion: reduce)').matches)finish();else{el('Confirm').classList.add('wc-closing');setTimeout(finish,180);}
  }
  const adminInvoke=input=>{
    const actions={pin:['community_admin_pin',{post_id:input.id,pin:input.pinned}],edit:['community_admin_edit',{post_id:input.id,message_body:input.body,template_name:input.template_name??null}],announce:['community_admin_announce',{message_body:input.body}],verify:['community_admin_verify',{target_username:input.username,verify:input.verified}],notify:['community_admin_notify',{target_username:input.username,notification_title:input.title,message_body:input.body}]};
    const args=actions[input.action];if(!args)return Promise.reject(Error('Choose an available admin action.'));return rpc(...args);
  };
  const tools=window.CommunityAdminTools.create({parent:document.body,invoke:adminInvoke,confirm,changed:async()=>{await load();await roleRefresh();window.dispatchEvent(new Event('community-web-refresh'));}});
  el('Admin').onclick=()=>tools.open();
  async function roleRefresh(){
    if(!user)return;const token=accountEpoch;
    try{const value=await rpc('community_admin_status');if(token!==accountEpoch)return;const changed=admin!==!!value;admin=value===true;el('Admin').hidden=!admin;if(changed){render();window.dispatchEvent(new Event('community-web-role'));}
      const names=[...new Set([profile?.username,...posts.map(p=>p.username)].filter(Boolean))];
      for(let i=0;i<names.length;i+=100){const badges=await rpc('community_badges',{usernames:names.slice(i,i+100)});if(token!==accountEpoch)return;window.CommunityRoles.update(badges);}
      await notifications();
    }catch{/* An older database still supports the regular feed. */}
  }
  async function notifications(){
    const token=accountEpoch,items=await rpc('community_notifications');if(token!==accountEpoch)return;
    const list=el('Notifications'),existing=new Map([...list.children].map(n=>[n.dataset.id,n]));
    for(const item of items||[]){if(!notified.has(item.id)){notified.add(item.id);const id=user.id;window.AppNotifications.show({group:'community-admin:'+id,title:item.title,message:item.body,symbol:'♛',duration:8000,onClick:()=>{if(user?.id!==id)return;location.hash='community';window.dispatchEvent(new CustomEvent('community-web-view',{detail:'feed'}));requestAnimationFrame(()=>list.scrollIntoView({block:'nearest'}));}});}if(existing.has(item.id))continue;const card=text('article');card.dataset.id=item.id;card.append(text('h4',item.title),text('p',item.body),button('Dismiss',async()=>{try{await rpc('community_ack_notifications',{notification_ids:[item.id]});card.remove();list.hidden=!list.children.length;}catch(error){status(errorMessage(error));}}));list.append(card);}
    const keep=new Set((items||[]).map(n=>n.id));for(const [id,n]of existing)if(!keep.has(id))n.remove();list.hidden=!list.children.length;
  }
  el('ConfirmAccept').addEventListener('click',()=>endConfirm(true));el('ConfirmCancel').addEventListener('click',()=>endConfirm(false));
  el('Confirm').addEventListener('cancel',e=>{e.preventDefault();endConfirm(false);});
  el('Confirm').addEventListener('click',e=>{if(e.target!==el('Confirm'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)endConfirm(false);});
  function postNode(post){
    const card=text('article',undefined,'wc-card wc-post');card.dataset.id=post.id;
    card.dataset.username=post.username;
    card.dataset.snapshot=JSON.stringify([post,admin]);
    if(post.pinned||post.announcement){const markers=text('div',undefined,'community-post-markers');if(post.pinned)markers.append(text('span','PINNED'));if(post.announcement)markers.append(text('span','ANNOUNCEMENT'));card.append(markers);}
    const header=text('div',undefined,'wc-post-heading'), author=text('div',undefined,'wc-post-author');
    author.append(text('strong',post.display_name),text('span','@'+post.username));
    author.tabIndex=0;author.setAttribute('role','button');author.setAttribute('aria-label','Open '+post.display_name+'’s corner');
    if(post.is_admin!==undefined)window.CommunityRoles.update([{username:post.username,is_admin:post.is_admin,verified:post.verified}]);window.CommunityRoles.mark(author.querySelector('strong'),post.username);
    const date=text('time');date.dateTime=post.created_at;
    date.textContent=new Date(post.created_at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    date.title=new Date(post.created_at).toLocaleString();
    if(post.edited_at)date.append(text('span',' · edited','community-post-edited'));
    header.append(text('div',String(post.display_name||'◈').slice(0,1).toUpperCase(),'wc-avatar'),author,date);card.append(header);
    header.firstElementChild.tabIndex=0;header.firstElementChild.setAttribute('role','button');header.firstElementChild.setAttribute('aria-label','Open '+post.display_name+'’s corner');
    card.append(text('p',post.kind==='joined'?'Just joined the Community. Say hello.':post.body,post.kind==='joined'?'wc-post-intro':'wc-post-body'));
    if(post.look&&typeof post.look==='object'){
      const hex=value=>/^#[a-f\d]{6}$/i.test(value||'')?value:null;
      const look=text('div',undefined,'wc-shared-look'),copy=text('div'),palette=text('div',undefined,'wc-palette');
      const colour=hex(post.look.colour)||'#9b7cff',background=hex(post.look.background)||'#111321';
      look.style.setProperty('--look-colour',colour);look.style.setProperty('--look-bg',background);
      copy.append(text('small','SHARED TEMPLATE'),text('strong',String(post.look.template_name||styleNames[post.look.style]||'Visualiser look').slice(0,120)),text('p','View and save this look in the desktop app.'));
      const colours=[colour,...(Array.isArray(post.look.design?.colours)?post.look.design.colours.filter(hex).slice(0,4):[]),background];
      for(const c of colours){const swatch=text('i');swatch.style.background=c;palette.append(swatch);}look.append(copy,palette);card.append(look);
    }
    if(post.is_own||admin){const actions=text('div',undefined,'wc-post-actions');if(admin)actions.append(tools.postControls(post));actions.append(button('Delete',async()=>{
      if(writing||!await confirm('Delete this post?','This removes the post from the Community feed.','Delete post'))return;
      writing=true;controls();const token=epoch;
      try{await rpc('community_delete_post',{post_id:post.id});if(token!==epoch)return;posts=posts.filter(p=>p.id!==post.id);pending=pending.filter(p=>p.id!==post.id);card.remove();render();window.dispatchEvent(new Event('community-web-refresh'));status('Post deleted.');}
      catch(error){status(errorMessage(error));}finally{writing=false;controls();}
    }));card.append(actions);}
    return card;
  }
  function render(){
    const list=el('Posts');
    const visiblePosts=posts.filter(p=>!p.announcement);
    if(!visiblePosts.length)list.replaceChildren(text('div',loaded?'Nothing here yet. Share a thought to get things started.':'Loading the conversation…','wc-empty'));
    else{
      list.querySelector('.wc-empty')?.remove();const existing=new Map([...list.children].map(n=>[n.dataset.id,n])),keep=new Set(visiblePosts.map(p=>p.id));
      for(const [id,n]of existing)if(!keep.has(id))n.remove();
      let previous=null;for(const post of visiblePosts){let n=existing.get(post.id);if(!n||n.dataset.snapshot!==JSON.stringify([post,admin])){const fresh=postNode(post);if(n)n.replaceWith(fresh);n=fresh;}const next=previous?previous.nextSibling:list.firstChild;if(n!==next)list.insertBefore(n,next);previous=n;}
    }
    el('More').hidden=!hasMore;el('NewPosts').hidden=!pending.length;
    el('NewPosts').textContent=`Show ${pending.length} new ${pending.length===1?'post':'posts'}`;
  }
  async function load({quiet=false,older=false}={}){
    if(!user||loading||writing)return;loading=true;const token=epoch;
    const last=older?posts.at(-1):null;
    try{
      const args={feed_scope:scope,before_created:last?.created_at||null,before_id:last?.id||null};let response=await client.rpc('community_feed_v2',args);
      if(response.error?.code==='PGRST202'||response.error?.code==='42883')response=await client.rpc('community_feed',args);if(response.error)throw response.error;const data=response.data;
      if(token!==epoch||!user)return;
      const incoming=Array.isArray(data)?data:[];
      if(quiet&&loaded){const known=new Set(posts.map(p=>p.id)),first=posts[0];pending=incoming.filter(p=>!p.announcement&&(known.has(p.id)?JSON.stringify(p)!==JSON.stringify(posts.find(old=>old.id===p.id)):(!first||p.pinned||p.created_at>first.created_at||(p.created_at===first.created_at&&p.id>first.id))));el('NewPosts').hidden=!pending.length;el('NewPosts').textContent=pending.some(p=>known.has(p.id))?'Show feed updates':`Show ${pending.length} new ${pending.length===1?'post':'posts'}`;return;}
      posts=older?[...posts,...incoming.filter(p=>!posts.some(old=>old.id===p.id))]:incoming;pending=[];loaded=true;hasMore=incoming.length===30;render();status();
    }catch(error){if(token===epoch&&(!quiet||!loaded))status(errorMessage(error),true);}
    finally{loading=false;if(token!==epoch&&user)setTimeout(()=>load(),0);}
  }
  async function account(session,force=false){
    const next=session?.user||null;if(accountId===next?.id&&!force)return;
    if(accountId!==next?.id){if(accountId)window.AppNotifications.clear('community-admin:'+accountId);notified=new Set();}
    const token=++accountEpoch;accountId=next?.id;user=next;profile=null;epoch++;posts=[];pending=[];loaded=false;hasMore=false;
    admin=false;el('Admin').hidden=true;tools.close();window.CommunityRoles.clear();el('Notifications').replaceChildren();el('Notifications').hidden=true;
    window.dispatchEvent(new CustomEvent('community-web-account',{detail:{user,profile:null,ready:false}}));
    el('Body').value='';el('Counter').textContent='0 / 1000';el('Announce').checked=false;status();
    el('Login').hidden=!!user;el('Account').hidden=!user;el('Feed').hidden=!user;el('Profile').hidden=true;el('Composer').hidden=true;render();
    if(!user)return;
    el('DisplayName').textContent='Your account';el('Username').textContent='';el('Initial').textContent='◈';
    try{
      const {data,error}=await client.from('profiles').select('username,display_name,bio,created_at').eq('id',user.id).maybeSingle();
      if(token!==accountEpoch)return;if(error)throw error;profile=data;
      el('DisplayName').textContent=profile?.display_name||'Make it yours';el('Username').textContent=profile?'@'+profile.username:'Finish your profile';el('Initial').textContent=(profile?.display_name||'◈').slice(0,1).toUpperCase();
      if(profile)window.CommunityRoles.mark(el('DisplayName'),profile.username);
      el('Profile').hidden=false;el('Composer').hidden=!profile;
      el('ProfileName').value=profile?.display_name||String(user.user_metadata?.full_name||user.user_metadata?.name||'').slice(0,40);el('ProfileUsername').value=profile?.username||'';el('ProfileBio').value=profile?.bio||'';el('Announce').closest('label').hidden=!!profile;
      await load();
      await roleRefresh();
      window.dispatchEvent(new CustomEvent('community-web-account',{detail:{user,profile,ready:true}}));
    }catch(error){if(token===accountEpoch)status(errorMessage(error),true);}
  }
  async function login(provider){
    if(writing)return;
    if(location.protocol!=='https:'||location.origin!==new URL(SITE).origin){status('Sign-in is available on the published Visualiser Studio website.');return;}
    writing=true;controls();status('Opening '+(provider==='google'?'Google':'Discord')+'…');
    try{
      const {data,error}=await client.auth.signInWithOAuth({provider,options:{redirectTo:SITE,skipBrowserRedirect:true,...(provider==='discord'?{scopes:'identify'}:{queryParams:{prompt:'select_account'}})}});
      if(error)throw error;const destination=new window.URL(data.url);if(destination.origin!==PROJECT_URL||destination.pathname!=='/auth/v1/authorize')throw new Error();
      sessionStorage.setItem('vs-web-community-return','1');location.assign(destination.href);
    }catch(error){status(errorMessage(error));writing=false;controls();}
  }
  el('Google').addEventListener('click',()=>login('google'));el('Discord').addEventListener('click',()=>login('discord'));
  el('Profile').addEventListener('submit',async e=>{
    e.preventDefault();if(writing||!user)return;
    const username=el('ProfileUsername').value.trim().toLowerCase(),display_name=el('ProfileName').value.trim();
    if(!/^[a-z0-9_]{3,24}$/.test(username)){status('Choose a username with 3–24 letters, numbers or underscores.');el('ProfileUsername').focus();return;}
    if(!display_name||display_name.length>40){status('Enter a display name of up to 40 characters.');el('ProfileName').focus();return;}
    writing=true;controls();
    try{const bio=el('ProfileBio').value.trim();if(profile){const {error}=await client.from('profiles').update({username,display_name,bio}).eq('id',user.id);if(error)throw error;}else await rpc('community_create_profile',{username,display_name,bio,announce:el('Announce').checked});writing=false;const {data,error}=await client.auth.getSession();if(error)throw error;await account(data.session,true);status('Profile saved.');}
    catch(error){status(errorMessage(error));}finally{writing=false;controls();}
  });
  el('Post').dataset.hint='Post · Ctrl+Enter';
  el('Body').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.isComposing){event.preventDefault();if(!el('Post').disabled)el('Composer').requestSubmit();}});
  el('Composer').addEventListener('submit',async e=>{
    e.preventDefault();if(writing||!profile)return;const body=el('Body').value.trim();
    if(!body||body.length>1000){status('Write a message of up to 1,000 characters.');el('Body').focus();return;}
    writing=true;controls();const draft=el('Body').value,token=++epoch;
    try{await rpc('community_publish_post',{post_body:body,shared_look:null});if(token!==epoch)return;if(el('Body').value===draft)el('Body').value='';el('Counter').textContent=el('Body').value.length+' / 1000';writing=false;await load();status('Posted to Community.');}
    catch(error){status(errorMessage(error));}finally{writing=false;controls();}
  });
  el('Body').addEventListener('input',()=>{el('Counter').textContent=el('Body').value.length+' / 1000';});
  el('Logout').addEventListener('click',async()=>{
    if(writing||!await confirm('Log out?','Are you sure you want to log out on this browser?','Log out','Stay signed in'))return;
    writing=true;controls();try{const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;await account(null,true);}catch(error){status(errorMessage(error));}finally{writing=false;controls();}
  });
  section.querySelectorAll('[data-wc-scope]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.wcScope===scope)return;scope=b.dataset.wcScope;epoch++;posts=[];pending=[];loaded=false;hasMore=false;section.querySelectorAll('[data-wc-scope]').forEach(n=>n.setAttribute('aria-pressed',String(n===b)));render();if(!loading)load();}));
  el('Refresh').addEventListener('click',()=>load());el('More').addEventListener('click',()=>load({older:true}));
  el('Retry').addEventListener('click',async()=>{if(!client){location.reload();return;}try{const {data,error}=await client.auth.getSession();if(error)throw error;await account(data.session,true);}catch(error){status(errorMessage(error),true);}});
  el('NewPosts').addEventListener('click',()=>{const updates=new Set(pending.map(p=>p.id));posts=[...pending,...posts.filter(p=>!updates.has(p.id))].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));pending=[];render();el('Feed').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
  let inView=false;
  const observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;if(inView&&user)load({quiet:loaded});},{rootMargin:'100px'});observer.observe(section);
  const refresh=()=>{if(inView&&!document.hidden&&!el('Confirm').open&&!document.querySelector('.community-admin-dialog[open]')){load({quiet:loaded});roleRefresh();}};
  setInterval(refresh,30000);window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  async function start(){
    try{
      if(!window.supabase?.createClient)throw new Error();
      client=window.supabase.createClient(PROJECT_URL,KEY,{auth:{flowType:'pkce',storageKey:'visualiser-web-community',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      client.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'||event==='SIGNED_IN')setTimeout(()=>account(session),0);});
      const {data,error}=await client.auth.getSession();if(error)throw error;await account(data.session);
      const params=new URLSearchParams(location.search),oauthError=params.get('error_description')||new URLSearchParams(location.hash.slice(1)).get('error_description');
      if(oauthError){status('Sign-in didn’t finish. Please try Google or Discord again.');history.replaceState(null,'',location.pathname+'#community');}
      if(sessionStorage.getItem('vs-web-community-return')==='1'){sessionStorage.removeItem('vs-web-community-return');location.hash='community';}
    }catch(error){status('Community couldn’t start. Please reload the page and try again.',true);el('Google').disabled=true;el('Discord').disabled=true;}
  }
  window.WebCommunity={rpc,getClient:()=>client,getUser:()=>user,getProfile:()=>profile,isAdmin:()=>admin,confirm,status,renderPost:postNode,admin:adminInvoke,refreshRoles:roleRefresh,dismissOverlays:()=>{tools.close();endConfirm(false);}};
  start();
})();
/* WEBSITE COMMUNITY JS END */
