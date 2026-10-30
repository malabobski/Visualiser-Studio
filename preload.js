const { contextBridge, ipcRenderer, webUtils } = require('electron');
contextBridge.exposeInMainWorld('abletonLink', {
  get:()=>ipcRenderer.invoke('ableton:get'),
  install:()=>ipcRenderer.invoke('ableton:install'),
  command:request=>ipcRenderer.invoke('ableton:command',request),
  onChange:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('ableton:state',listener);return()=>ipcRenderer.removeListener('ableton:state',listener);}
});
contextBridge.exposeInMainWorld('fileBrowser', {
  places:()=>ipcRenderer.invoke('files:places'),
  list:location=>ipcRenderer.invoke('files:list',location),
  preview:location=>ipcRenderer.invoke('files:preview',location),
  mkdir:(location,name)=>ipcRenderer.invoke('files:mkdir',location,name),
  finish:(id,selection)=>ipcRenderer.invoke('files:finish',id,selection),
  pick:options=>ipcRenderer.invoke('files:pick',options),
  path:token=>ipcRenderer.invoke('files:path',token),
  onShow:callback=>{const listener=(_event,options)=>callback(options);ipcRenderer.on('files:show',listener);return()=>ipcRenderer.removeListener('files:show',listener);}
});
contextBridge.exposeInMainWorld('community', {
  openSong: track => ipcRenderer.invoke('community:openSong', track),
  onReturn: callback => {
    const listener = () => callback();
    ipcRenderer.on('community:open', listener);
    return () => ipcRenderer.removeListener('community:open', listener);
  },
  get: () => ipcRenderer.invoke('community:get'),
  signIn: provider => ipcRenderer.invoke('community:signIn', provider),
  cancel: () => ipcRenderer.invoke('community:cancel'),
  refresh: () => ipcRenderer.invoke('community:refresh'),
  signOut: () => ipcRenderer.invoke('community:signOut'),
  saveProfile: profile => ipcRenderer.invoke('community:saveProfile', profile),
  friends: () => ipcRenderer.invoke('community:friends'),
  searchPeople: query => ipcRenderer.invoke('community:searchPeople', query),
  sendRequest: username => ipcRenderer.invoke('community:sendRequest', username),
  friendAction: request => ipcRenderer.invoke('community:friendAction', request),
  feed: query => ipcRenderer.invoke('community:feed', query),
  announcements: () => ipcRenderer.invoke('community:announcements'),
  publishPost: post => ipcRenderer.invoke('community:publishPost', post),
  deletePost: id => ipcRenderer.invoke('community:deletePost', id),
  person: username => ipcRenderer.invoke('community:person', username),
  socialSettings: () => ipcRenderer.invoke('community:socialSettings'),
  setActivity: value => ipcRenderer.invoke('community:setActivity', value),
  friendActivity: () => ipcRenderer.invoke('community:friendActivity'),
  blockPerson: value => ipcRenderer.invoke('community:blockPerson', value),
  dmInbox: () => ipcRenderer.invoke('community:dmInbox'),
  dmOpen: username => ipcRenderer.invoke('community:dmOpen', username),
  dmSend: message => ipcRenderer.invoke('community:dmSend', message),
  adminStatus: () => ipcRenderer.invoke('community:adminStatus'),
  admin: value => ipcRenderer.invoke('community:admin', value),
  badges: usernames => ipcRenderer.invoke('community:badges', usernames),
  notifications: () => ipcRenderer.invoke('community:notifications'),
  acknowledgeNotifications: ids => ipcRenderer.invoke('community:acknowledgeNotifications', ids),
  onChange: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('community:state', listener);
    return () => ipcRenderer.removeListener('community:state', listener);
  }
});
contextBridge.exposeInMainWorld('exportFiles', {
  get:()=>ipcRenderer.invoke('exports:get'),
  chooseFolder:()=>ipcRenderer.invoke('exports:folder'),
  naming:options=>ipcRenderer.invoke('exports:naming',options),
  prepare:request=>ipcRenderer.invoke('exports:prepare',request)
});
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
 update:(id,change)=>ipcRenderer.invoke('projects:update',id,change),
 delete:id=>ipcRenderer.invoke('projects:delete',id)
});

contextBridge.exposeInMainWorld('mediaVolume', {
  get: target => ipcRenderer.invoke('media-volume:get', target),
  set: request => ipcRenderer.invoke('media-volume:set', request)
});

contextBridge.exposeInMainWorld('appUpdates', {
  acknowledgeHighlights:()=>ipcRenderer.invoke('updates:highlights-seen'),
  get:()=>ipcRenderer.invoke('updates:get'),
  check:()=>ipcRenderer.invoke('updates:check'),
  setAutomatic:value=>ipcRenderer.invoke('updates:automatic',value),
  install:()=>ipcRenderer.invoke('updates:install'),
  onChange:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('updates:state',listener);return()=>ipcRenderer.removeListener('updates:state',listener);}
});
