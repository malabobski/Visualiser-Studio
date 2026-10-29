(() => {
  const bridge = window.community, ui = window.CommunityUI;
  const el = name => document.getElementById('community' + name);
  if (!bridge || !ui || !el('Feed')) return;
  const screen = document.getElementById('screen-community');
  let signedIn = false, scope = 'everyone', posts = [], pending = [], attached = null;
  let loading = false, writing = false, epoch = 0, hasMore = false, initialized = false;
  let announcements=[],announcing=false;
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent=text; if(cls)n.className=cls; return n; };
  const button = (text, run) => { const b=node('button',text); b.type='button'; b.addEventListener('click',run); return b; };
  const styleName = style => [...document.querySelectorAll('.style-card')].find(card=>card.dataset.style===style)?.querySelector('.card-name')?.textContent || style;
  const supportedLook=look=>!look.unsupported&&window.SceneTransitions.supportsStyle(look.style);
  const updateMessage='Update Visualiser Studio to use this style.';
  const announcementPanel=node('section',undefined,'community-feed community-announcements');announcementPanel.id='communityAnnouncements';announcementPanel.hidden=true;announcementPanel.setAttribute('aria-label','Announcements');
  const announcementHeading=node('header',undefined,'community-feed-heading');announcementHeading.append(node('h2','Announcements'));const announcementList=node('div');announcementPanel.append(announcementHeading,announcementList);el('Feed').after(announcementPanel);
  async function loadAnnouncements(){if(!signedIn||announcing||!bridge.announcements)return;announcing=true;const token=epoch;try{const result=await bridge.announcements();if(token!==epoch||result.error)return;announcements=result.posts||[];renderAnnouncements();}finally{announcing=false;}}
  function renderAnnouncements(){
    const existing=new Map([...announcementList.children].map(n=>[n.dataset.postId,n]));const keep=new Set(announcements.map(p=>p.id));for(const [id,n]of existing)if(!keep.has(id))n.remove();
    if(!announcements.length){announcementList.replaceChildren(node('p','News from the creator will appear here.','community-empty'));return;}
    let previous=null;for(const post of announcements){let card=existing.get(post.id);if(!card||card.dataset.snapshot!==JSON.stringify([post,!!window.CommunityModeration?.isAdmin()])){const fresh=renderPost(post);if(card)card.replaceWith(fresh);card=fresh;}const next=previous?previous.nextSibling:announcementList.firstChild;if(next!==card)announcementList.insertBefore(card,next);previous=card;}
    window.dispatchEvent(new Event('community-posts-rendered'));
  }
  function cleanLook(input) {
    if(!supportedLook(input))throw new Error(updateMessage);
    const clean = window.SceneTransitions.look(input); delete clean.automation;
    return {...clean,response:['smooth','punchy'].includes(input.response)?input.response:'balanced',...(input.template_name?{template_name:String(input.template_name).trim().slice(0,120)}:{})};
  }
  function feedback(text) { el('FeedStatus').textContent=text; }
  function attachment() {
    el('LookAttachment').hidden=!attached;
    el('LookAttachmentName').textContent=attached ? (attached.template_name||styleName(attached.style))+' · template attached' : '';
    if(attached)el('LookAttachment').style.setProperty('--shared-colour',attached.colour);
  }
  function renderPost(post) {
    const card=node('article',undefined,'community-card community-post'); card.dataset.postId=post.id;
    card.dataset.snapshot=JSON.stringify([post,!!window.CommunityModeration?.isAdmin()]);
    if(post.pinned||post.announcement){const markers=node('div',undefined,'community-post-markers');if(post.pinned)markers.append(node('span','PINNED'));if(post.announcement)markers.append(node('span','ANNOUNCEMENT'));card.append(markers);}
    const header=node('header',undefined,'community-post-heading');
    const author=node('div',undefined,'community-post-author');
    author.append(node('strong',post.display_name),node('span','@'+post.username));
    window.CommunityRoles?.mark(author.querySelector('strong'),post.username);
    if(post.is_admin!==undefined)window.CommunityRoles?.update([{username:post.username,is_admin:post.is_admin,verified:post.verified}]);
    author.classList.add('community-profile-link');author.tabIndex=0;author.setAttribute('role','button');author.addEventListener('click',()=>ui.openPerson?.(post.username));author.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();ui.openPerson?.(post.username);}});
    const date=node('time',undefined); date.dateTime=post.created_at;
    const when=new Date(post.created_at); date.textContent=when.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' · '+when.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); date.title=when.toLocaleString();
    header.append(node('div',post.display_name.slice(0,1).toUpperCase(),'community-avatar'),author,date);
    if(post.edited_at)date.append(node('span',' · edited','community-post-edited'));
    const avatar=header.firstElementChild;avatar.classList.add('community-profile-link');avatar.tabIndex=0;avatar.setAttribute('role','button');avatar.setAttribute('aria-label','Open '+post.display_name+'’s corner');avatar.onclick=()=>ui.openPerson?.(post.username);avatar.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();ui.openPerson?.(post.username);}};
    card.append(header);
    if(post.kind==='joined')card.append(node('p','Just joined the Community. Say hello.','community-post-joined'));
    else if(post.body)card.append(node('p',post.body,'community-post-body'));
    if(post.look) {
      const look=node('div',undefined,'community-shared-look');
      look.style.setProperty('--shared-colour',post.look.colour); look.style.setProperty('--shared-background',post.look.background);
      const supported=supportedLook(post.look);
      const text=node('div');text.append(node('small','SHARED TEMPLATE'),node('strong',post.look.template_name||styleName(post.look.style)),node('span',supported?'Style · colours · parameters':updateMessage));
      const palette=node('div',undefined,'community-look-palette');
      for(const colour of [post.look.colour,...(post.look.design?.colours||[]).slice(0,4),post.look.background]) { const swatch=node('i');swatch.style.background=colour;palette.append(swatch); }
      const save=button('Save to Templates',async()=>{
        if(!supportedLook(post.look)){feedback(updateMessage);return;}
        const name=await window.TemplateNames.ask(post.look.template_name||styleName(post.look.style)+' by @'+post.username);if(!name)return;
        try {
          const id=crypto.randomUUID();
          saveTemplatesList([...loadTemplates(),{...cleanLook(post.look),id,name,aspect:'16:9',resolution:'1080',framerate:appSettings.framerate||'60'}]);
          if(!loadTemplates().some(t=>t.id===id))throw new Error();
          feedback('Look saved to Templates.');
        } catch { feedback('Couldn’t save that look. Check your local storage and try again.'); }
      });
      save.disabled=!supported;if(!supported){save.dataset.hint=updateMessage;save.setAttribute('aria-label','Save unavailable. '+updateMessage);look.classList.add('is-unsupported');}
      look.append(text,palette,save);card.append(look);
    }
    if(post.is_own||window.CommunityModeration?.isAdmin()) {
      const footer=node('footer');
      if(window.CommunityModeration?.isAdmin())footer.append(window.CommunityModeration.postControls(post));
      footer.append(button('Delete',async()=>{
        if(writing || !await ui.confirm('Delete this post?','This removes the post from the Community feed.','Delete post'))return;
        writing=true;
        try { const result=await bridge.deletePost(post.id); if(result.error)throw new Error(result.error); posts=posts.filter(p=>p.id!==post.id);pending=pending.filter(p=>p.id!==post.id);announcements=announcements.filter(p=>p.id!==post.id);card.remove();render();renderAnnouncements();feedback('Post deleted.'); }
        catch(error){feedback(error.message||'Couldn’t delete that post.');} finally{writing=false;}
      }));card.append(footer);
    }
    return card;
  }
  function render() {
    const list=el('FeedPosts');
    const visiblePosts=posts.filter(post=>!post.announcement);
    if(!visiblePosts.length) {
      list.replaceChildren(node('div',initialized?'Nothing here yet. Share a thought or a look to get things started.':'Loading the feed…','community-feed-empty'));
    } else {
      list.querySelector('.community-feed-empty')?.remove();
      const existing=new Map([...list.children].map(n=>[n.dataset.postId,n]));
      const keep=new Set(visiblePosts.map(p=>p.id));for(const [id,n]of existing)if(!keep.has(id))n.remove();
      // insertBefore preserves existing cards, focus and their state.
      let previous=null;
      for(const post of visiblePosts) {
        let card=existing.get(post.id);if(!card||card.dataset.snapshot!==JSON.stringify([post,!!window.CommunityModeration?.isAdmin()])){const fresh=renderPost(post);if(card)card.replaceWith(fresh);card=fresh;}
        const desired=previous?previous.nextSibling:list.firstChild;
        if(card!==desired)list.insertBefore(card,desired);
        previous=card;
      }
    }
    el('FeedMore').hidden=!hasMore;
    el('NewPosts').hidden=!pending.length;
    el('NewPosts').textContent=`Show ${pending.length} new ${pending.length===1?'post':'posts'}`;
    window.dispatchEvent(new Event('community-posts-rendered'));
  }
  async function load({quiet=false,older=false}={}) {
    if(!signedIn||loading||writing)return;
    loading=true; const token=epoch;
    const cursor=older&&posts.length?{id:posts.at(-1).id,created_at:posts.at(-1).created_at}:null;
    try {
      const result=await bridge.feed({scope,cursor});
      if(token!==epoch||!signedIn)return;
      if(result.error)throw new Error(result.error);
      const incoming=result.posts||[];
      if(quiet&&initialized) {
        // Don't shift the article someone is reading when new posts arrive.
        const known=new Set(posts.map(p=>p.id));
        const first=posts[0];
        pending=incoming.filter(p=>!p.announcement&&(known.has(p.id)?JSON.stringify(p)!==JSON.stringify(posts.find(old=>old.id===p.id)):(!first||p.pinned||p.created_at>first.created_at||(p.created_at===first.created_at&&p.id>first.id))));
        el('NewPosts').hidden=!pending.length;
        el('NewPosts').textContent=pending.some(p=>known.has(p.id))?'Show feed updates':`Show ${pending.length} new ${pending.length===1?'post':'posts'}`;
        return;
      }
      posts=older?[...posts,...incoming.filter(p=>!posts.some(old=>old.id===p.id))]:incoming;
      pending=[];initialized=true;hasMore=incoming.length===30;feedback('');render();
    } catch(error){if(token===epoch&&(!quiet||!initialized))feedback(error.message||'Couldn’t load the feed.');}
    finally {loading=false;if(token!==epoch&&signedIn)setTimeout(()=>load(),0);}
  }
  function account(next) {
    const changed=signedIn!==!!next.signedIn;signedIn=!!next.signedIn;
    el('Feed').hidden=!signedIn;
    announcementPanel.hidden=!signedIn;
    if(changed){announcements=[];renderAnnouncements();}
    if(changed){epoch++;posts=[];pending=[];attached=null;initialized=false;hasMore=false;el('PostBody').value='';el('PostCount').textContent='0 / 1000';feedback('');attachment();render();}
    if(signedIn&&!screen.hidden&&!initialized)setTimeout(()=>{load();loadAnnouncements();},0);
  }
  const picker=document.createElement('dialog');picker.className='record-dialog community-template-picker';picker.setAttribute('aria-label','Share a saved template');document.body.append(picker);
  el('AttachLook').textContent='＋ Share template';
  el('AttachLook').addEventListener('click',()=>{
    picker.replaceChildren(node('h2','Share a template'));const list=node('div',undefined,'community-template-options');
    for(const template of loadTemplates()){
      const choice=button(template.name,()=>{if(!supportedLook(template))return;attached=cleanLook({...template,template_name:template.name});attachment();picker.close();});
      choice.disabled=!supportedLook(template);if(choice.disabled)choice.dataset.hint=updateMessage;list.append(choice);
    }
    if(!list.children.length)list.append(node('p','Save a template in Create first. You’ll choose its name when saving.'));
    picker.append(list,button('Cancel',()=>picker.close()));picker.showModal();
  });
  picker.addEventListener('click',e=>{if(e.target!==picker)return;const r=picker.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)picker.close();});
  el('RemoveLook').addEventListener('click',()=>{attached=null;attachment();});
  el('PostBody').addEventListener('input',()=>{el('PostCount').textContent=el('PostBody').value.length+' / 1000';});
  el('PublishPost').dataset.hint='Post · Ctrl+Enter';
  el('PostBody').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.isComposing){event.preventDefault();event.stopPropagation();if(!el('PublishPost').disabled)el('PostForm').requestSubmit();}});
  el('PostForm').addEventListener('submit',async event=>{
    event.preventDefault();if(writing)return;
    if(!el('PostBody').value.trim()&&!attached){feedback('Write something or attach a look first.');return;}
    writing=true;epoch++;el('PublishPost').disabled=true;
    const body=el('PostBody').value,look=attached;
    try {
      const result=await bridge.publishPost({body,look});if(result.error)throw new Error(result.error);
      window.Achievements?.unlock('social-post');if(look)window.Achievements?.unlock('social-template');
      if(el('PostBody').value===body)el('PostBody').value='';
      if(attached===look)attached=null;attachment();el('PostCount').textContent=el('PostBody').value.length+' / 1000';
      writing=false;await load();feedback('Posted to Community.');
    } catch(error){feedback(error.message||'Couldn’t post. Your draft is still here.');}
    finally{writing=false;el('PublishPost').disabled=false;}
  });
  screen.querySelectorAll('[data-feed-scope]').forEach(b=>b.addEventListener('click',()=>{
    if(b.dataset.feedScope===scope)return;scope=b.dataset.feedScope;epoch++;initialized=false;posts=[];pending=[];hasMore=false;
    screen.querySelectorAll('[data-feed-scope]').forEach(option=>option.setAttribute('aria-pressed',String(option===b)));
    render();if(loading)setTimeout(()=>load(),100);else load();
  }));
  el('FeedRefresh').addEventListener('click',()=>load());
  el('FeedMore').addEventListener('click',()=>load({older:true}));
  el('NewPosts').addEventListener('click',()=>{const updates=new Map(pending.map(p=>[p.id,p]));posts=[...pending,...posts.filter(p=>!updates.has(p.id))].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id));pending=[];render();el('Feed').scrollIntoView({block:'start',behavior:document.body.classList.contains('reduce-motion')?'instant':'smooth'});});
  window.addEventListener('community-admin-changed',()=>{render();renderAnnouncements();});window.addEventListener('community-feed-refresh',()=>{load();loadAnnouncements();});
  const refresh=()=>{if(!screen.hidden&&!document.hidden&&!el('ConfirmDialog').open){load({quiet:initialized});loadAnnouncements();}};
  new MutationObserver(refresh).observe(screen,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);
  window.addEventListener('community-account',event=>account(event.detail));account(ui.get());
})();
