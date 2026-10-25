(() => {
  const dialog=document.createElement('dialog');dialog.id='templateNameDialog';dialog.className='record-dialog';
  dialog.innerHTML='<form novalidate><div class="record-heading"><div><p class="eyebrow">SAVE TEMPLATE</p><h2>A name for this look</h2></div><button type="button" aria-label="Close">×</button></div><label for="templateSaveName">Template name</label><input id="templateSaveName" type="text" maxlength="120" autocomplete="off" placeholder="My template" aria-describedby="templateSaveStatus"><p id="templateSaveStatus" role="status"></p><button type="submit">Save template</button></form>';
  document.body.append(dialog);const input=dialog.querySelector('input'),status=dialog.querySelector('[role=status]');let resolve;
  function finish(name){dialog.close();const done=resolve;resolve=null;done?.(name);}
  dialog.querySelector('[aria-label=Close]').onclick=()=>finish(null);
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish(null);});
  dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)finish(null);});
  dialog.querySelector('form').onsubmit=e=>{e.preventDefault();const name=input.value.trim();if(!name){status.textContent='Give your template a name.';input.focus();return;}finish(name);};
  window.TemplateNames={ask:initial=>{if(resolve)return Promise.resolve(null);input.value=String(initial||'').slice(0,120);status.textContent='';dialog.showModal();input.focus();input.select();return new Promise(done=>{resolve=done;});}};
})();
