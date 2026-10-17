(() => {
  if (window.desktopPlatform?.os !== 'darwin') return;
  document.documentElement.classList.add('mac-platform');
  const translate = text => text.replace(/Ctrl\+/g, '⌘+').replace(/Alt\+/g, '⌥+');
  function label(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.closest('input,textarea,[contenteditable],script,style')) return;
      if (!node.parentElement?.closest('kbd,.automation-guide,.project-empty')) return;
      const text = translate(node.nodeValue);
      if (text !== node.nodeValue) node.nodeValue = text;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      for (const name of ['data-hint', 'aria-label', 'title']) {
        const value = node.getAttribute(name);
        if (value && translate(value) !== value) node.setAttribute(name, translate(value));
      }
      for (const child of node.childNodes) label(child);
    }
  }
  document.addEventListener('DOMContentLoaded', () => {
    label(document.body);
    new MutationObserver(changes => {
      for (const change of changes) {
        if (change.type === 'attributes') label(change.target);
        else if (change.type === 'characterData') label(change.target);
        else for (const node of change.addedNodes) label(node);
      }
    }).observe(document.body, { subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['data-hint','aria-label','title'] });
    const footer = document.querySelector('.settings-footer');
    if (!footer) return;
    const group = document.createElement('details');
    group.className = 'settings-group mac-platform-settings';
    group.innerHTML = '<summary>Mac permissions & media</summary><div class="settings-row"><label>Now Playing source<select id="macPlayerSource"><option value="auto">Automatic · Spotify or Apple Music</option><option value="com.spotify.client">Spotify</option><option value="com.apple.Music">Apple Music</option></select></label><p>Allow Automation access to show track details and use playback controls. Other apps can still play into Live Audio, but their media controls are unavailable in this preview.</p></div><div class="settings-row"><strong>Live Audio permissions</strong><p>Allow system audio and screen recording when macOS asks. If capture is silent, check these permissions and reopen the app.</p><div class="mac-permission-actions"><button type="button" data-mac-settings="audio">System audio</button><button type="button" data-mac-settings="screen">Screen recording</button><button type="button" data-mac-settings="automation">Automation</button></div><p class="mac-status" id="macPermissionStatus" role="status"></p></div>';
    footer.before(group);
    async function refresh() {
      try {
        const state = await window.desktopPlatform.macStatus();
        if (!state) return;
        group.querySelector('#macPlayerSource').value = state.preferred;
        group.querySelector('#macPermissionStatus').textContent =
          (state.preview ? 'Mac preview · ' : '') + state.architecture + ' · Screen access: ' + state.screen +
          (state.mediaMessage ? ' · ' + state.mediaMessage : '');
      } catch { group.querySelector('#macPermissionStatus').textContent = 'Could not read Mac permissions. Reopen Settings to try again.'; }
    }
    group.addEventListener('toggle', () => { if (group.open) refresh(); });
    group.querySelector('#macPlayerSource').onchange = async event => {
      try { await window.desktopPlatform.chooseMacPlayer(event.target.value); } catch {}
      refresh();
    };
    group.querySelectorAll('[data-mac-settings]').forEach(button => button.onclick = () => window.desktopPlatform.openMacSettings(button.dataset.macSettings).catch(() => {}));
    window.addEventListener('focus', () => { if (group.open) refresh(); });
  });
})();
