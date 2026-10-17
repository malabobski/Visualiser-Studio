const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('interfaceScale', {
  get:()=>ipcRenderer.invoke('interface:zoom-get'),
  set:value=>ipcRenderer.invoke('interface:zoom-set',value)
});
contextBridge.exposeInMainWorld('desktopPlatform', {
  os: process.platform,
  macStatus: () => ipcRenderer.invoke('mac:status'),
  openMacSettings: section => ipcRenderer.invoke('mac:settings', section),
  chooseMacPlayer: preferred => ipcRenderer.invoke('mac:player', preferred)
});

// Expose a safe function `window.discord.setStatus()` to your webpage
contextBridge.exposeInMainWorld('discord', {
  setStatus: (details, state) => ipcRenderer.send('set-discord-status', { details, state }),
  setEnabled: enabled => ipcRenderer.send('set-discord-enabled', enabled)
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
  confirmExit: () => ipcRenderer.invoke('window:confirm-exit'),
  onExitRequested: callback => {
    const listener=()=>callback();ipcRenderer.on('window:confirm-exit',listener);
    return ()=>ipcRenderer.removeListener('window:confirm-exit',listener);
  },
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

contextBridge.exposeInMainWorld('projectFiles', {
 pathForFile:file=>webUtils.getPathForFile(file),
 list:()=>ipcRenderer.invoke('projects:list'),
 save:data=>ipcRenderer.invoke('projects:save',data),
 open:id=>ipcRenderer.invoke('projects:open',id),
 update:(id,change)=>ipcRenderer.invoke('projects:update',id,change)
});

contextBridge.exposeInMainWorld('mediaVolume', {
  get: target => ipcRenderer.invoke('media-volume:get', target),
  set: request => ipcRenderer.invoke('media-volume:set', request)
});

contextBridge.exposeInMainWorld('appUpdates', {
  get:()=>ipcRenderer.invoke('updates:get'),
  check:()=>ipcRenderer.invoke('updates:check'),
  setAutomatic:value=>ipcRenderer.invoke('updates:automatic',value),
  install:()=>ipcRenderer.invoke('updates:install'),
  onChange:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('updates:state',listener);return()=>ipcRenderer.removeListener('updates:state',listener);}
});
