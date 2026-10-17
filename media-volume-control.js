// Shared behaviour for the fullscreen overlay and Mini Player.
(() => {
  const preference = 'visualiserMediaVolumeTarget';
  window.MediaVolumeControl = {
    mount({ slider, output, select, getSource, isActive = () => true, onNotice = () => {}, hint }) {
      let epoch = 0, reading = false, writing = false, editing = false, pending = null;
      let timer, lastSource = '', sourceAppId = '', available = false, disposed = false;
      try { const saved = localStorage.getItem(preference); if (['system', 'app'].includes(saved)) select.value = saved; } catch {}
      const draw = (value, muted = false) => {
        slider.style.setProperty('--volume-progress', value + '%');
        slider.classList.toggle('is-muted', muted);
        output.textContent = muted ? 'Muted' : Math.round(value) + '%';
      };
      const describe = () => {
        const source = getSource(), app = source ? mediaSourceName(source) : 'Captured app';
        const label = select.value === 'system' ? 'System volume' : app + ' volume';
        slider.setAttribute('aria-label', label);
        output.title = label;
        if (hint) hint.textContent = select.value === 'system' ? 'Controls your system output volume.' : /chrome|msedge|firefox|brave/i.test(source?.sourceAppId || '') ? 'Controls the browser’s volume across its tabs.' : 'Controls the current media app’s volume.';
      };
      async function refresh() {
        if (disposed || reading || writing || pending || editing || !isActive()) return;
        const version = epoch, target = select.value;
        reading = true;
        try {
          const result = await window.mediaVolume?.get(target);
          if (version !== epoch || editing || writing || pending) return;
          available = !!result?.available;
          slider.disabled = !available;
          sourceAppId = result?.sourceAppId || '';
          if (available) { slider.value = result.value; draw(result.value, result.muted); slider.title = ''; describe(); }
          else { output.textContent = '—'; slider.title = output.title = result?.reason || 'Volume control unavailable.'; if (hint) hint.textContent = slider.title; }
        } catch { if (version === epoch) { available = false; slider.disabled = true; output.textContent = '—'; } }
        finally { reading = false; }
      }
      async function flush() {
        clearTimeout(timer);
        if (disposed || writing || !pending) return;
        const request = pending; pending = null; writing = true;
        try {
          const result = await window.mediaVolume.set({ target: request.target, value: request.value, sourceAppId: request.sourceAppId });
          if (request.epoch === epoch && !result?.available) { slider.disabled = true; available = false; output.textContent = '—'; onNotice(result?.reason || 'Could not change volume.'); }
          else if (request.epoch === epoch && !pending && !editing) { slider.value = result.value; draw(result.value, result.muted); }
        } catch { if (request.epoch === epoch) onNotice('Could not change volume. Try again.'); }
        finally { writing = false; if (pending) flush(); }
      }
      function sourceChanged() {
        const next = getSource()?.sourceAppId || '';
        if (next === lastSource) return;
        lastSource = next;
        if (select.value === 'app') { epoch++; pending = null; clearTimeout(timer); slider.disabled = true; available = false; output.textContent = '—'; }
        describe(); refresh();
      }
      const changeTarget = () => {
        epoch++; pending = null; clearTimeout(timer); editing = false; slider.disabled = true; available = false; output.textContent = '—';
        try { localStorage.setItem(preference, select.value); } catch {}
        describe(); refresh();
      };
      select.addEventListener('change', changeTarget);
      slider.addEventListener('pointerdown', () => { editing = true; });
      const finishEdit = () => { editing = false; flush(); };
      slider.addEventListener('pointerup', finishEdit); slider.addEventListener('pointercancel', finishEdit);
      const finishPointer = () => { if (editing) finishEdit(); };
      window.addEventListener('pointerup', finishPointer); window.addEventListener('pointercancel', finishPointer);
      slider.addEventListener('blur', finishEdit);
      slider.addEventListener('keydown', event => { if ([' ', 'Enter', 'Tab'].includes(event.key)) event.stopPropagation(); });
      slider.addEventListener('input', () => {
        if (!available || slider.disabled) return;
        const value = Number(slider.value); draw(value);
        pending = { target: select.value, value, sourceAppId, epoch };
        clearTimeout(timer); timer = setTimeout(flush, 80);
      });
      slider.addEventListener('change', finishEdit);
      const storage = event => { if (event.key === preference && ['system', 'app'].includes(event.newValue) && event.newValue !== select.value) { select.value = event.newValue; changeTarget(); } };
      window.addEventListener('storage', storage); window.addEventListener('focus', refresh);
      const poll = setInterval(() => { sourceChanged(); refresh(); }, 1000);
      describe(); refresh();
      return { refresh, sourceChanged, dispose() { disposed = true; clearInterval(poll); clearTimeout(timer); window.removeEventListener('storage', storage); window.removeEventListener('focus', refresh); window.removeEventListener('pointerup', finishPointer); window.removeEventListener('pointercancel', finishPointer); } };
    }
  };
})();
