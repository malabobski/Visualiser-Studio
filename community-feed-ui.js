(() => {
  const bridge = window.community, ui = window.CommunityUI;
  const el = name => document.getElementById('community' + name);
  if (!bridge || !ui || !el('Feed')) return;
  const screen = document.getElementById('screen-community');
  let signedIn = false, scope = 'everyone', posts = [], pending = [], attached = null;
  let loading = false, writing = false, epoch = 0, hasMore = false, initialized = false;
  const node = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent=text; if(cls)n.className=cls; return n; };
  const button = (text, run) => { const b=node('button',text); b.type='button'; b.addEventListener('click',run); return b; };
  const styleName = style => document.querySelector(`.style-card[data-style="${style}"] .card-name`)?.textContent || style;
  function cleanLook(input) {
    const clean = window.SceneTransitions.look(input); delete clean.automation;
    return {...clean,response:['smooth','punchy'].includes(input.response)?input.response:'balanced'};
  }
  function feedback(text) { el('FeedStatus').textContent=text; }
  function attachment() {
    el('LookAttachment').hidden=!attached;
    el('LookAttachmentName').textContent=attached ? styleName(attached.style)+' · attached from Create' : '';
    if(attached)el('LookAttachment').style.setProperty('--shared-colour',attached.colour);
  }
  function renderPost(post) {
    const card=node('article',undefined,'community-card community-post'); card.dataset.postId=post.id;
    const header=node('header',undefined,'community-post-heading');
    const author=node('div',undefined,'community-post-author');
    author.append(node('strong',post.display_name),node('span','@'+post.username));
    const date=node('time',undefined); date.dateTime=post.created_at;
    const when=new Date(post.created_at); date.textContent=when.toLocaleDateString(undefined,{month:'short',day:'numeric'})+' · '+when.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit'}); date.title=when.toLocaleString();
    header.append(node('div',post.display_name.slice(0,1).toUpperCase(),'community-avatar'),author,date);
    card.append(header);
    if(post.kind==='joined')card.append(node('p','Just joined the Community. Say hello.','community-post-joined'));
    else if(post.body)card.append(node('p',post.body,'community-post-body'));
    if(post.look) {
      const look=node('div',undefined,'community-shared-look');
      look.style.setProperty('--shared-colour',post.look.colour); look.style.setProperty('--shared-background',post.look.background);
      const text=node('div');text.append(node('small','SHARED LOOK'),node('strong',styleName(post.look.style)),node('span','Style · colours · parameters'));
      const palette=node('div',undefined,'community-look-palette');
      for(const colour of [post.look.colour,...(post.look.design?.colours||[]).slice(0,4),post.look.background]) { const swatch=node('i');swatch.style.background=colour;palette.append(swatch); }
      look.append(text,palette,button('Save to Templates',()=>{
        try {
          const id=crypto.randomUUID();
          saveTemplatesList([...loadTemplates(),{...cleanLook(post.look),id,name:styleName(post.look.style)+' by @'+post.username,aspect:'16:9',resolution:'1080',framerate:appSettings.framerate||'60'}]);
          if(!loadTemplates().some(t=>t.id===id))throw new Error();
          feedback('Look saved to Templates.');
        } catch { feedback('Couldn’t save that look. Check your local storage and try again.'); }
      })); card.append(look);
    }
    if(post.is_own) {
      const footer=node('footer');
      footer.append(button('Delete',async()=>{
        if(writing || !await ui.confirm('Delete this post?','This removes the post from the Community feed.','Delete post'))return;
        writing=true;
        try { const result=await bridge.deletePost(post.id); if(result.error)throw new Error(result.error); posts=posts.filter(p=>p.id!==post.id);pending=pending.filter(p=>p.id!==post.id);card.remove();render();feedback('Post deleted.'); }
        catch(error){feedback(error.message||'Couldn’t delete that post.');} finally{writing=false;}
      }));card.append(footer);
    }
    return card;
  }
  function render() {
    const list=el('FeedPosts');
    if(!posts.length) {
      list.replaceChildren(node('div',initialized?'Nothing here yet. Share a thought or a look to get things started.':'Loading the feed…','community-feed-empty'));
    } else {
      list.querySelector('.community-feed-empty')?.remove();
      const existing=new Map([...list.children].map(n=>[n.dataset.postId,n]));
      const keep=new Set(posts.map(p=>p.id));for(const [id,n]of existing)if(!keep.has(id))n.remove();
      // insertBefore preserves existing cards, focus and their state.
      let previous=null;
      for(const post of posts) {
        const card=existing.get(post.id)||renderPost(post);
        const desired=previous?previous.nextSibling:list.firstChild;
        if(card!==desired)list.insertBefore(card,desired);
        previous=card;
      }
    }
    el('FeedMore').hidden=!hasMore;
    el('NewPosts').hidden=!pending.length;
    el('NewPosts').textContent=`Show ${pending.length} new ${pending.length===1?'post':'posts'}`;
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
        pending=incoming.filter(p=>!known.has(p.id)&&(!first||p.created_at>first.created_at||(p.created_at===first.created_at&&p.id>first.id)));
        el('NewPosts').hidden=!pending.length;
        el('NewPosts').textContent=`Show ${pending.length} new ${pending.length===1?'post':'posts'}`;
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
    if(changed){epoch++;posts=[];pending=[];attached=null;initialized=false;hasMore=false;el('PostBody').value='';el('PostCount').textContent='0 / 1000';feedback('');attachment();render();}
    if(signedIn&&!screen.hidden&&!initialized)setTimeout(()=>load(),0);
  }
  el('AttachLook').addEventListener('click',()=>{attached=cleanLook(captureCurrentLook());attachment();});
  el('RemoveLook').addEventListener('click',()=>{attached=null;attachment();});
  el('PostBody').addEventListener('input',()=>{el('PostCount').textContent=el('PostBody').value.length+' / 1000';});
  el('PostForm').addEventListener('submit',async event=>{
    event.preventDefault();if(writing)return;
    if(!el('PostBody').value.trim()&&!attached){feedback('Write something or attach a look first.');return;}
    writing=true;epoch++;el('PublishPost').disabled=true;
    const body=el('PostBody').value,look=attached;
    try {
      const result=await bridge.publishPost({body,look});if(result.error)throw new Error(result.error);
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
  el('NewPosts').addEventListener('click',()=>{posts=[...pending,...posts];pending=[];render();el('Feed').scrollIntoView({block:'start',behavior:document.body.classList.contains('reduce-motion')?'instant':'smooth'});});
  const refresh=()=>{if(!screen.hidden&&!document.hidden&&!el('ProfileDialog').open&&!el('ConfirmDialog').open)load({quiet:initialized});};
  new MutationObserver(refresh).observe(screen,{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,30000);
  window.addEventListener('community-account',event=>account(event.detail));account(ui.get());
})();
