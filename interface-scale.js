(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const bridge = window.interfaceScale, footer = document.querySelector('.settings-footer');
    if (!bridge || !footer) return;
    const group = document.createElement('details');group.className='settings-group';
    group.innerHTML='<summary>Interface size</summary><div class="settings-row"><label class="interface-scale-label">Zoom <output id="interfaceScaleValue">100%</output><input id="interfaceScale" type="range" min="75" max="150" step="5" value="100"></label><small>Choose a comfortable size for your display. Exported videos keep their selected resolution.</small><button id="interfaceScaleReset" type="button" class="menu-default">Reset to 100%</button><small id="interfaceScaleStatus" role="status"></small></div>';
    footer.before(group);
    const slider=group.querySelector('input'),output=group.querySelector('output'),status=group.querySelector('#interfaceScaleStatus');
    let version=0;
    const render=value=>{slider.value=value;output.textContent=value+'%';};
    slider.oninput=()=>{output.textContent=slider.value+'%';};
    slider.onchange=async()=>{const current=++version;try{const value=await bridge.set(Number(slider.value));if(current===version){render(value);status.textContent='';}}catch{status.textContent='Could not save the interface size. Try again.';}};
    group.querySelector('button').onclick=()=>{render(100);slider.dispatchEvent(new Event('change',{bubbles:true}));};
    bridge.get().then(render).catch(()=>{});
  });
})();
