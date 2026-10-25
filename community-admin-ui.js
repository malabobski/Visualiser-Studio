// Shared, dependency-free UI for the app and single-file website.
(() => {
 const node=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
 const button=(label,run)=>{const n=node('button',label);n.type='button';n.onclick=run;return n;};
 const cache=new Map();
 function paint(target){
  target.querySelector(':scope > .community-role-badges')?.remove();
  let name=target.querySelector(':scope > .community-display-name');
  if(!name){name=node('span',undefined,'community-display-name');while(target.firstChild)name.append(target.firstChild);target.append(name);}
  target.classList.add('community-name-with-badges');name.title=name.textContent;
  const roles=cache.get(target.dataset.roleUsername);if(!roles)return;
  const group=node('span',undefined,'community-role-badges');
  for(const [enabled,kind,label,path]of [[roles.is_admin,'crown','Creator / Admin','M2 6l5 4 5-7 5 7 5-4-3 14H5Z'],[roles.verified,'verified','Verified account','M20 6 9 17l-5-5']]){
   if(!enabled)continue;const badge=node('span',undefined,'community-role-badge is-'+kind);badge.title=label;badge.setAttribute('aria-label',label);badge.setAttribute('role','img');badge.tabIndex=0;
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const shape=document.createElementNS(svg.namespaceURI,'path');shape.setAttribute('d',path);svg.append(shape);badge.append(svg);group.append(badge);
  }
  if(group.children.length)target.append(group);
 }
 window.CommunityRoles={mark:(target,username)=>{if(!target)return;target.dataset.roleUsername=username;paint(target);},get:username=>cache.get(username),update:roles=>{for(const role of roles||[])cache.set(role.username,role);document.querySelectorAll('[data-role-username]').forEach(paint);},clear:()=>{cache.clear();document.querySelectorAll('.community-role-badges').forEach(n=>n.remove());}};
 window.CommunityAdminTools={create:({parent,invoke,confirm,changed})=>{
  const dialog=node('dialog',undefined,'community-admin-dialog');dialog.setAttribute('aria-labelledby','communityAdminHeading');parent.append(dialog);let writing=false,mode='announce';
  function close(){if(!writing)dialog.close();}
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();});
  async function submit(input,status){if(writing)return;writing=true;dialog.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=true);
   try{const result=await invoke(input);if(result?.error)throw Error(result.error);status.textContent={announce:'Announcement published.',notify:'Notification sent.',verify:input.verified?'Account verified.':'Verification removed.',edit:'Post updated.',pin:input.pinned?'Post pinned.':'Post unpinned.'}[input.action]||'Saved.';await changed?.();return true;}
   catch(error){status.textContent=error.message||'Couldn’t save. Try again.';return false;}
   finally{writing=false;dialog.querySelectorAll('button,input,textarea,select').forEach(n=>n.disabled=false);}
  }
  function field(form,label,max,area=false,value=''){const wrapper=node('label',label),input=node(area?'textarea':'input');if(!area)input.type='text';input.maxLength=max;input.value=value;if(area)input.rows=4;wrapper.append(input);form.append(wrapper);return input;}
  function shell(title){dialog.replaceChildren();const header=node('header'),copy=node('div');copy.append(node('small','CREATOR TOOLS'));const heading=node('h2',title);heading.id='communityAdminHeading';copy.append(heading);header.append(copy,button('×',close));header.lastChild.setAttribute('aria-label','Close admin tools');dialog.append(header);}
  function open(tab='announce'){
   mode=tab;shell('Your Community');const tabs=node('div',undefined,'community-admin-tabs');
   for(const [id,label]of [['announce','Announcement'],['notify','Notification'],['verify','Verification']]){const b=button(label,()=>open(id));b.setAttribute('aria-pressed',String(id===mode));tabs.append(b);}dialog.append(tabs);
   const form=node('form'),status=node('p',undefined,'community-admin-status');status.setAttribute('role','status');form.noValidate=true;
   let username,title,body,verify;
   if(mode==='announce'){form.append(node('p','Publish a marked announcement to both feed views.'));body=field(form,'Announcement',1000,true);}
   if(mode==='notify'){username=field(form,'Send to username',24);username.placeholder='@username';title=field(form,'Title',80);body=field(form,'Message',500,true);form.append(node('p','Sent privately to this account. It appears in their app notifications or website inbox.'));}
   if(mode==='verify'){username=field(form,'Username',24);username.placeholder='@username';const label=node('label','Verification');verify=node('select');for(const [value,text]of [['true','Verified account'],['false','Remove verification']]){const o=node('option',text);o.value=value;verify.append(o);}label.append(verify);form.append(label);}
   const save=node('button',mode==='announce'?'Publish announcement':mode==='notify'?'Send notification':'Save verification');save.type='submit';form.append(save,status);dialog.append(form);
   form.onsubmit=async e=>{e.preventDefault();if(mode==='notify'&&!await confirm('Send this notification?','Send “'+title.value.trim()+'” to @'+username.value.replace(/^@/,'').trim()+'?','Send notification'))return;
    const input={action:mode,...(username?{username:username.value}:{}),...(title?{title:title.value}:{}),...(body?{body:body.value}:{}),...(verify?{verified:verify.value==='true'}:{})};
    if(await submit(input,status)){if(mode!=='verify')form.reset();}
   };
   if(!dialog.open)dialog.showModal();form.querySelector('input,textarea')?.focus();
  }
  function edit(post){shell('Edit post');const form=node('form');form.noValidate=true;form.append(node('p','Changes keep the original author and publication time.'));
   const body=field(form,'Post text',1000,true,post.body||''),name=post.look?field(form,'Template name',120,false,post.look.template_name||''):null;
   if(name)name.placeholder='Saved template name';const status=node('p',undefined,'community-admin-status');status.setAttribute('role','status');const save=node('button','Save changes');save.type='submit';form.append(save,status);dialog.append(form);
   form.onsubmit=async e=>{e.preventDefault();if(await submit({action:'edit',id:post.id,body:body.value,...(name?.value.trim()?{template_name:name.value.trim()}:{})},status))close();};
   if(!dialog.open)dialog.showModal();body.focus();
  }
  return {open,edit,close:()=>dialog.close(),postControls:post=>{
   const group=node('span',undefined,'community-post-admin');group.append(button('Edit',()=>edit(post)),button(post.pinned?'Unpin':'Pin',async()=>{const result=await invoke({action:'pin',id:post.id,pinned:!post.pinned});if(result?.error){await confirm('Couldn’t change pin',result.error,'OK','Close');return;}await changed?.();}));return group;
  }};
 }};
})();
