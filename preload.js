const { contextBridge, ipcRenderer } = require('electron');

// Expose a safe function `window.discord.setStatus()` to your webpage
contextBridge.exposeInMainWorld('discord', {
  setStatus: (details, state) => ipcRenderer.send('set-discord-status', { details, state })
});

// Expose `window.nowPlaying` for the Live section's Now Playing view.
// main.js polls Windows SMTC via now-playing.ps1 and pushes changes on
// 'now-playing:update'; `get()` fetches whatever it last saw, for the
// initial render before the first change event arrives.
contextBridge.exposeInMainWorld('nowPlaying', {
  control: (action, position) => ipcRenderer.invoke('now-playing:control', action, position),
  get: () => ipcRenderer.invoke('now-playing:get'),
  onChange: (callback) => ipcRenderer.on('now-playing:update', (event, payload) => callback(payload))
});
contextBridge.exposeInMainWorld('windowControls', {
  minimise: () => ipcRenderer.invoke('window:control', 'minimise'),
  maximise: () => ipcRenderer.invoke('window:control', 'maximise'),
  close: () => ipcRenderer.invoke('window:control', 'close'),
  getState: () => ipcRenderer.invoke('window:state'),
  onStateChange: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('window:state-changed', listener);
    return () => ipcRenderer.removeListener('window:state-changed', listener);
  }
});

contextBridge.exposeInMainWorld('recordingFiles', {
  folder: () => ipcRenderer.invoke('recording:folder'),
  chooseFolder: () => ipcRenderer.invoke('recording:choose-folder'),
  save: bytes => ipcRenderer.invoke('recording:save', bytes)
});

contextBridge.exposeInMainWorld('miniPlayer', {
  open: () => ipcRenderer.invoke('mini:open'),
  bounds: () => ipcRenderer.invoke('mini:bounds'),
  resize: bounds => ipcRenderer.send('mini:resize',bounds),
  action: (action,value) => ipcRenderer.invoke('mini:action',action,value)
});
