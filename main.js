require('./project-files');
// This is the "front door" of the desktop app. Electron runs this file first.
// It figures out where the bundled FFmpeg lives, starts the same local server
// your app already used, and opens a window pointed at it.

const { app, BrowserWindow, screen, session, desktopCapturer, ipcMain, dialog, Menu, shell, systemPreferences } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fsp = require('fs/promises');
const { UpdateService } = require('./app-updates');
const { autoUpdater } = require('electron-updater');
const { MediaVolume } = require('./media-volume');
const { MacAutomation } = require('./mac-automation');
const { MacNowPlaying, allowedApps } = require('./mac-now-playing');
const macAutomation = process.platform === 'darwin' ? new MacAutomation() : null;
const mediaVolume = new MediaVolume({ automation: macAutomation });
let macNowPlaying;
const isMacPreview = process.platform === 'darwin' && require('./package.json').visualiserMacPreview === true;
// Test installers have their own preferences/projects and cannot enter the
// production update feed while signing and native integration are being tested.
if (isMacPreview) {
  const previewData = path.join(app.getPath('appData'), 'Visualiser Studio Mac Preview');
  require('node:fs').mkdirSync(previewData, { recursive:true });
  app.setPath('userData', previewData);
}
let desktopSourceAppId = '';

const RPC = require('discord-rpc');
require('discord-rpc/src/transports')['visualiser-ipc'] = require('./discord-ipc').DiscordTransport;

const APP_TITLE = 'Visualiser Studio';
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');
let exitConfirmed=false;
function requestExitConfirmation(){
  if(!mainWindow||mainWindow.isDestroyed())return;
  if(mainWindow.isMinimized())mainWindow.restore();
  mainWindow.show();mainWindow.focus();
  mainWindow.webContents.send('window:confirm-exit');
}
ipcMain.handle('window:confirm-exit',event=>{
  if(!mainWindow||event.sender!==mainWindow.webContents)return;
  exitConfirmed=true;app.quit();
});

// Discord Application ID (from the Discord Developer Portal). The public key
// there is for the HTTP Interactions endpoint, a different feature — Rich
// Presence over discord-rpc's local IPC transport only needs this ID.
const DISCORD_CLIENT_ID = '1047543674596249680';
const WEBSITE_URL = 'https://malchim.malabobski.workers.dev/';

let discordClient;
let discordReady = false;
let discordEnabled = false;
const activityStart = Date.now();
let pendingDiscordActivity={details:'Getting things ready…',state:'Visualiser Studio'};
let discordLastKey='',discordLastSent=0,discordTimer;
let discordConnecting=false,discordStopped=false,discordRetry;
function retryDiscord(){
  clearTimeout(discordRetry);
  if(discordStopped||!discordEnabled)return;
  discordRetry=setTimeout(setupDiscordRPC,15000);discordRetry.unref?.();
}
function flushDiscordActivity(){
  if(!discordEnabled || !discordReady || !discordClient)return;
  const key=JSON.stringify(pendingDiscordActivity);
  if(key===discordLastKey)return;
  clearTimeout(discordTimer);
  const wait=Math.max(0,4000-(Date.now()-discordLastSent));
  if(wait){discordTimer=setTimeout(flushDiscordActivity,wait);return;}
  discordLastKey=key;discordLastSent=Date.now();
  // discord-rpc's older setActivity wrapper drops the clickable-image URL.
  // Send the activity payload directly through the same local RPC transport.
  discordClient.request('SET_ACTIVITY', {
    pid:process.pid,
    activity:{
      ...pendingDiscordActivity,
      timestamps:{start:activityStart},
      assets:{large_image:'app_icon',large_text:'Visit the Visualiser Studio website',large_url:WEBSITE_URL},
      buttons:[{label:'Visit website',url:WEBSITE_URL}],
      instance:false
    }
  }).catch(()=>{discordLastKey='';});
}

// Connects to the local Discord desktop client over IPC. If Discord isn't
// running, login() just rejects and we quietly do nothing — Rich Presence
// is a nice-to-have, never something the app should depend on.
function setupDiscordRPC() {
  if(discordStopped||discordConnecting||discordReady)return;
  clearTimeout(discordRetry);discordConnecting=true;
  const client=discordClient = new RPC.Client({ transport: 'visualiser-ipc' });
  const disconnected=()=>{
    if(discordClient!==client)return;
    discordConnecting=false;discordReady=false;discordLastKey='';retryDiscord();
  };
  client.on('disconnected',disconnected);
  client.on('error',()=>{disconnected();client.destroy().catch(()=>{});});

  discordClient.on('ready', () => {
    if(discordClient!==client)return;
    discordConnecting=false;
    discordReady = true;
    flushDiscordActivity();
  });

  discordClient.login({ clientId: DISCORD_CLIENT_ID }).catch((err) => {
    disconnected();client.destroy().catch(()=>{});
    console.log('Discord RPC unavailable:', err.message);
  });
}

// Renderer calls window.discord.setStatus(details, state) via preload.js,
// which forwards it here as a 'set-discord-status' IPC message.
ipcMain.on('set-discord-status', (event, payload = {}) => {
  if(!payload || typeof payload!=='object')return;
  const clean=value=>typeof value==='string'?value.trim().slice(0,128):'';
  pendingDiscordActivity={details:clean(payload.details)||'Visualiser Studio',state:clean(payload.state)||undefined};
  flushDiscordActivity();
});
ipcMain.on('set-discord-enabled', (event, enabled) => {
  if(typeof enabled!=='boolean')return;
  discordEnabled=enabled;
  clearTimeout(discordTimer);
  discordLastKey='';
  if(enabled)flushDiscordActivity();
  else if(discordReady)discordClient.clearActivity().catch(()=>{});
  if(enabled&&!discordReady)setupDiscordRPC();
  if(!enabled)clearTimeout(discordRetry);
});

// Only one copy of the app should ever run at once — a second copy would
// otherwise try to start its own server on the same port and crash with
// EADDRINUSE. If another instance is already running, just focus it and quit.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ffmpeg-static hands us a path to a ready-to-use ffmpeg program.
// When the app is packaged for distribution, that path lands inside a
// compressed "app.asar" archive, and programs can't be run directly out of
// there. electron-builder is told (see package.json "asarUnpack") to leave a
// real, runnable copy in a matching "app.asar.unpacked" folder instead, so we
// just point at that folder when needed.
function resolveFfmpegPath() {
  let ffmpegPath = require('ffmpeg-static');
  if (ffmpegPath.includes('app.asar')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
  }
  return ffmpegPath;
}

const PORT = 3000;
let mainWindow, miniWindow;
const updatePreferencesPath = () => path.join(app.getPath('userData'),'update-preferences.json');
const updates = new UpdateService({
  updater:autoUpdater,version:app.getVersion(),
  inspectLatestVersion:isMacPreview ? undefined : async()=>{
    const response=await fetch('https://api.github.com/repos/malabobski/Visualiser-Studio-Releases/releases/latest',{headers:{Accept:'application/vnd.github+json','User-Agent':'Visualiser-Studio'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Release check failed');
    return (await response.json()).tag_name;
  },
  enabled:!isMacPreview && app.isPackaged && (['win32','darwin'].includes(process.platform) || !!process.env.APPIMAGE),
  disabledMessage:isMacPreview ? 'Mac preview · Updates are disabled for this test build. Install newer test builds manually.' : undefined,
  savePreference:async automatic=>{const file=updatePreferencesPath();await fsp.mkdir(path.dirname(file),{recursive:true});await fsp.writeFile(file,JSON.stringify({automatic}));},
  onInstall:()=>{exitConfirmed=true;},onInstallError:()=>{exitConfirmed=false;}
});
updates.on('change',state=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('updates:state',state);});
const isUpdateWindow = event => !!mainWindow && !mainWindow.isDestroyed() && event.sender===mainWindow.webContents;
ipcMain.handle('updates:get',event=>isUpdateWindow(event)?updates.snapshot():null);
ipcMain.handle('updates:check',event=>isUpdateWindow(event)?updates.check():null);
ipcMain.handle('updates:automatic',(event,value)=>isUpdateWindow(event)?updates.setAutomatic(value):null);
ipcMain.handle('updates:install',event=>isUpdateWindow(event)?updates.install():{ok:false,message:'Update installation unavailable.'});
app.on('will-quit',()=>updates.dispose());

const isVolumeWindow = event => event.sender === mainWindow?.webContents || event.sender === miniWindow?.webContents;
let interfaceZoom=100;
let interfaceWrite=Promise.resolve();
const interfacePreferencesPath=()=>path.join(app.getPath('userData'),'interface-preferences.json');
ipcMain.handle('interface:zoom-get',event=>isVolumeWindow(event)?interfaceZoom:100);
ipcMain.handle('interface:zoom-set',async(event,value)=>{
  if(!isUpdateWindow(event)||!Number.isFinite(value)||value<75||value>150||value%5!==0)throw Error('Invalid interface size.');
  const save=interfaceWrite.then(async()=>{
    const file=interfacePreferencesPath();await fsp.mkdir(path.dirname(file),{recursive:true});
    await fsp.writeFile(file,JSON.stringify({zoom:value}));interfaceZoom=value;
    if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.webContents.setZoomMode('isolated');mainWindow.webContents.setZoomFactor(value/100);}
    return value;
  });
  interfaceWrite=save.catch(()=>{});return save;
});
let macMediaPreference = 'auto';
const macPreferencesPath = () => path.join(app.getPath('userData'), 'mac-media-preferences.json');
ipcMain.handle('mac:status', event => {
  if (process.platform !== 'darwin' || !isVolumeWindow(event)) return null;
  return { screen: systemPreferences.getMediaAccessStatus('screen'), preferred: macMediaPreference,
    mediaMessage: macNowPlaying?.reason || '', preview: isMacPreview,
    version: app.getVersion(), architecture: process.arch };
});
ipcMain.handle('mac:settings', (event, section) => {
  if (process.platform !== 'darwin' || !isVolumeWindow(event)) return false;
  const pages = { screen: 'Privacy_ScreenCapture', automation: 'Privacy_Automation', audio: 'Privacy_AudioCapture' };
  if (!Object.hasOwn(pages, section)) return false;
  return shell.openExternal('x-apple.systempreferences:com.apple.preference.security?' + pages[section]).then(() => true).catch(() => false);
});
ipcMain.handle('mac:player', async (event, preferred) => {
  if (process.platform !== 'darwin' || !isVolumeWindow(event) || !allowedApps.includes(preferred)) return false;
  const file = macPreferencesPath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify({ preferred }));
  macMediaPreference = preferred;
  macNowPlaying?.setPreferred(preferred);
  macNowPlaying?.poll();
  return true;
});
ipcMain.handle('media-volume:get', async (event, target) => {
  if (!isVolumeWindow(event)) return { available: false, reason: 'Volume control unavailable.' };
  const sourceAppId = desktopSourceAppId;
  const result = await mediaVolume.request(target, sourceAppId);
  if (target === 'app' && sourceAppId !== desktopSourceAppId) return { available: false, reason: 'Media app changed. Try again.' };
  return { ...result, target, sourceAppId };
});
ipcMain.handle('media-volume:set', async (event, request) => {
  if (!isVolumeWindow(event) || !request || !Number.isFinite(request.value)) return { available: false, reason: 'Invalid volume request.' };
  if (request.target === 'app' && (!desktopSourceAppId || request.sourceAppId !== desktopSourceAppId)) return { available: false, reason: 'Media app changed. Try again.' };
  const sourceAppId = desktopSourceAppId;
  const result = await mediaVolume.request(request.target, sourceAppId, request.value);
  return { ...result, target: request.target, sourceAppId };
});
app.on('will-quit', () => {
  mediaVolume.stop();
  discordStopped=true;clearTimeout(discordRetry);clearTimeout(discordTimer);
  macNowPlaying?.stop();
  macAutomation?.stop();
  if (nowPlayingProcess) nowPlayingProcess.kill();
});

let mainAppPort;
let serverStartPromise;
let miniOpacity=1;

// --- Live section: system audio loopback -----------------------------------
// getDisplayMedia({audio:true}) normally pops the OS "pick a window/screen"
// dialog. Providing our own handler skips that dialog entirely and lets us
// hand back a fixed video source (any one screen — the renderer never shows
// the video, it only wants the accompanying loopback audio track) plus
// audio:'loopback' for system-wide audio. Modern macOS uses Chromium's
// CoreAudio Tap path and the usage description in the packaged Info.plist.
function setupSystemAudioLoopback() {
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      if (!sources.length) return callback({});
      callback({ video: sources[0], audio: 'loopback' });
    }).catch(() => callback({}));
  }, { useSystemPicker: false });
}

// --- Live section: "Now Playing" via Windows SMTC ---------------------------
// SMTC (System Media Transport Controls) is the same registry every media
// app — Spotify, browsers, VLC — publishes title/artist/artwork into for the
// Windows volume flyout, so reading it works regardless of what's playing.
// Read via a small bundled PowerShell script (now-playing.ps1) rather than a
// native npm binding: no compilation step, no Electron ABI rebuild, nothing
// to break when the app gets packaged. It's Windows-only and polls once a
// second, printing one line of JSON to stdout per change; if spawning it
// fails for any reason, Now Playing just stays empty rather than crashing.
let nowPlayingProcess = null;
let lastNowPlayingPayload = null;
ipcMain.handle('now-playing:get', () => lastNowPlayingPayload);
// Keep the bridge callable until a native media provider is available.
if (process.platform !== 'win32') ipcMain.handle('now-playing:control', (event, action, position) => isVolumeWindow(event) ? macNowPlaying?.control(action, position) ?? false : false);
function sendNowPlaying(payload) {
  lastNowPlayingPayload = payload;
  desktopSourceAppId = payload?.sourceAppId || '';
  for (const win of [mainWindow, miniWindow]) if (win && !win.isDestroyed()) win.webContents.send('now-playing:update', payload);
}
function setupNowPlaying() {
  if (process.platform === 'darwin') {
    macNowPlaying = new MacNowPlaying({ automation: macAutomation, onChange: sendNowPlaying });
    macNowPlaying.start(macMediaPreference);
    return;
  }
  if (process.platform !== 'win32') return;

  const send = sendNowPlaying;

  // Same reasoning as resolveFfmpegPath() above: when packaged, __dirname
  // points inside the compressed app.asar, and powershell.exe (an external
  // process, not Node's own asar-aware fs) can't open a file from in there.
  // package.json's "asarUnpack" leaves a real copy at the matching
  // ".asar.unpacked" path, so point at that instead when it applies.
  let scriptPath = path.join(__dirname, 'now-playing.ps1');
  if (scriptPath.includes('app.asar')) {
    scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
  }
  ipcMain.handle('now-playing:control', async (event, action, position) => {
    if (!isVolumeWindow(event)) return false;
    if (!['toggle', 'previous', 'next', 'seek'].includes(action)) return false;
    if (action === 'seek' && (!Number.isFinite(position) || position < 0)) return false;
    return new Promise(resolve => {
      const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Action', action];
      if (action === 'seek') args.push('-Position', String(position));
      const child = spawn('powershell.exe', args, { windowsHide: true });
      let output = ''; child.stdout.on('data', chunk => output += chunk.toString());
      const timer = setTimeout(() => { child.kill(); resolve(false); }, 20000);
      child.on('error', () => { clearTimeout(timer); resolve(false); });
      child.on('close', () => { clearTimeout(timer); resolve(output.trim() === 'true'); });
    });
  });
  console.log('[now-playing] starting poller:', scriptPath);
  nowPlayingProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]);

  let buffer = '';
  nowPlayingProcess.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        send(parsed.title ? parsed : null);
      } catch {
        console.warn('[now-playing] could not parse line from powershell:', trimmed.slice(0, 200));
      }
    }
  });
  nowPlayingProcess.on('error', (err) => console.warn('[now-playing] could not start powershell.exe:', err.message));
  nowPlayingProcess.on('close', (code) => console.log('[now-playing] powershell exited with code', code));
  // Surfaced rather than swallowed — if the WinRT calls in now-playing.ps1
  // fail (wrong method name, permissions, etc.), this is where it'll show up.
  // Run `npm start` from a terminal (rather than double-clicking the app) to
  // see these lines while troubleshooting.
  nowPlayingProcess.stderr.on('data', (chunk) => console.error('[now-playing] stderr:', chunk.toString().trim()));
}

let recordingFolder;
const recordingPrefsPath = () => path.join(app.getPath('userData'), 'recording-preferences.json');
async function getRecordingFolder() {
  if(recordingFolder!==undefined)return recordingFolder;
  try { recordingFolder=JSON.parse(await fsp.readFile(recordingPrefsPath(),'utf8')).folder || ''; }
  catch { recordingFolder=''; }
  return recordingFolder;
}
const folderLabel = folder => folder ? '/' + path.basename(folder) : 'Choose location';
ipcMain.handle('recording:folder', async () => folderLabel(await getRecordingFolder()));
ipcMain.handle('recording:choose-folder', async event => {
  const win=BrowserWindow.fromWebContents(event.sender);
  const result=await dialog.showOpenDialog(win,{title:'Default recording save location',properties:['openDirectory','createDirectory']});
  if(!result.canceled && result.filePaths[0]) {
    recordingFolder=result.filePaths[0];
    await fsp.writeFile(recordingPrefsPath(),JSON.stringify({folder:recordingFolder}));
  }
  return folderLabel(await getRecordingFolder());
});
ipcMain.handle('recording:save', async (event, bytes) => {
  if(!(bytes instanceof ArrayBuffer) && !ArrayBuffer.isView(bytes))throw new Error('Invalid recording data.');
  const folder=await getRecordingFolder();
  const name='Live visualiser '+new Date().toISOString().replace(/[:.]/g,'-')+'.webm';
  let target;
  if(folder) target=path.join(folder,name);
  else {
    const result=await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender),{title:'Save live recording',defaultPath:name,filters:[{name:'WebM video',extensions:['webm']}]});
    if(result.canceled || !result.filePath)return {saved:false};
    target=result.filePath;
  }
  await fsp.writeFile(target,Buffer.from(bytes),{flag:folder?'wx':'w'});
  return {saved:true,name:path.basename(target),location:folderLabel(path.dirname(target))};
});

function restoreFullApp() {
  if(mainWindow && !mainWindow.isDestroyed()){mainWindow.show();if(mainWindow.isMinimized())mainWindow.restore();mainWindow.focus();}
  if(miniWindow && !miniWindow.isDestroyed())miniWindow.close();
}
ipcMain.handle('mini:open', async () => {
  if(miniWindow && !miniWindow.isDestroyed()){miniWindow.show();miniWindow.focus();return;}
  miniWindow=new BrowserWindow({width:454,height:244,minWidth:340,minHeight:220,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,resizable:false,show:false,skipTaskbar:false,title:'Visualiser Studio · Mini player',icon:path.join(__dirname,'build','mini-icon.png'),webPreferences:{contextIsolation:true,preload:path.join(__dirname,'preload.js')}});
  miniWindow.setOpacity(miniOpacity);
  miniWindow.webContents.on('did-finish-load',()=>{miniWindow.webContents.setZoomMode('isolated');miniWindow.webContents.setZoomFactor(1);});
  miniWindow.once('ready-to-show',()=>{if(miniWindow){miniWindow.show();mainWindow?.hide();}});
  miniWindow.on('closed',()=>{miniWindow=null;if(mainWindow && !mainWindow.isDestroyed()){mainWindow.show();mainWindow.focus();}});
  await miniWindow.loadURL('http://localhost:'+mainAppPort+'/mini-player.html');
});
ipcMain.handle('mini:action',(event,action,value)=>{
  if(!miniWindow || event.sender!==miniWindow.webContents)return;
  if(action==='full')restoreFullApp();
  else if(action==='quit')app.quit();
  else if(action==='opacity' && Number.isFinite(value)){miniOpacity=Math.min(1,Math.max(.35,value));miniWindow.setOpacity(miniOpacity);}
  else if(action==='default-size'){
    const bounds=miniWindow.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
    miniWindow.setBounds({x:Math.max(area.x,Math.min(bounds.x,area.x+area.width-454)),y:Math.max(area.y,Math.min(bounds.y,area.y+area.height-244)),width:454,height:244});
  }
});
ipcMain.handle('mini:bounds',event=>event.sender===miniWindow?.webContents?miniWindow.getBounds():null);
ipcMain.on('mini:resize',(event,bounds)=>{
  if(!miniWindow || event.sender!==miniWindow.webContents || !bounds)return;
  if(!['x','y','width','height'].every(key=>Number.isFinite(bounds[key])))return;
  miniWindow.setBounds({x:Math.round(bounds.x),y:Math.round(bounds.y),width:Math.round(Math.min(1800,Math.max(340,bounds.width))),height:Math.round(Math.min(1400,Math.max(220,bounds.height)))});
});

ipcMain.handle('window:control', (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  if (action === 'minimise') win.minimize();
  else if (action === 'maximise') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
  else if (action === 'close') win.close();
});
ipcMain.handle('window:state', event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return { maximised: !!win?.isMaximized() };
});

async function createWindow() {
  const { startServer } = require('./server.js');

  // Start the same server.js logic as before, but tell it which ffmpeg to use.
  serverStartPromise ||= startServer({ port: PORT, ffmpegBin: resolveFfmpegPath() });
  const { port: activePort } = await serverStartPromise;

  mainAppPort=activePort;
  const workArea=screen.getPrimaryDisplay().workAreaSize;
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    icon: ICON_PATH,
    width: Math.min(1320,workArea.width),
    height: Math.min(880,workArea.height),
    minWidth: 640,
    minHeight: 420,
    backgroundColor: '#10121b',
    autoHideMenuBar: true,
    frame: process.platform === 'darwin',
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 14, y: 11 } } : {}),
    show: false,
    webPreferences: {
      contextIsolation: true,
      backgroundThrottling: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Electron normally renames the window to match the loaded page's <title>.
  // Keep the window titled "Visualiser Studio" regardless of what the page sets.
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault();
  });

  const sendWindowState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('window:state-changed', { maximised: mainWindow.isMaximized() });
  };
  mainWindow.on('maximize', sendWindowState);
  mainWindow.on('unmaximize', sendWindowState);
  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.maximize();
    mainWindow.show();
  });
  mainWindow.loadURL(`http://localhost:${activePort}`);

  // Stop Ctrl+scroll from zooming the whole window — this app uses Ctrl+scroll
  // on the volume slider for fine adjustment, and the two would otherwise fight.
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomMode('isolated');
    mainWindow.webContents.setZoomFactor(interfaceZoom/100);
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    mainWindow.setTitle(APP_TITLE);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.on('close',event=>{
    if(!exitConfirmed){
      event.preventDefault();
      if(process.platform === 'darwin') mainWindow.hide();
      else requestExitConfirmation();
    }
  });
}

app.whenReady().then(async () => {
  require('./export-files').setupExportFiles({app,ipcMain,dialog,session:session.defaultSession,getWindow:()=>mainWindow,getOrigin:()=>`http://localhost:${mainAppPort}`});
  try{const saved=JSON.parse(await fsp.readFile(interfacePreferencesPath(),'utf8'));if(Number.isFinite(saved.zoom)&&saved.zoom>=75&&saved.zoom<=150&&saved.zoom%5===0)interfaceZoom=saved.zoom;}catch{}
  if(process.platform === 'darwin') {
    try { const saved=JSON.parse(await fsp.readFile(macPreferencesPath(),'utf8'));if(allowedApps.includes(saved.preferred))macMediaPreference=saved.preferred; } catch {}
    require('./mac-menu').installMacMenu({ Menu, app, showMain: restoreFullApp, requestExit: () => app.quit() });
  }
  setupDiscordRPC();
  let automatic=true;try{automatic=JSON.parse(await fsp.readFile(updatePreferencesPath(),'utf8')).automatic!==false;}catch{}
  updates.start(automatic);
  setupSystemAudioLoopback();
  setupNowPlaying();
  createWindow();
});

app.on('before-quit', event => {
  if(!exitConfirmed&&mainWindow&&!mainWindow.isDestroyed()){
    event.preventDefault();requestExitConfirmation();return;
  }
  discordClient?.destroy().catch(() => {});
});

app.on('window-all-closed', () => {
  // On Windows/Linux, quit fully when the window closes.
  // On Mac, apps conventionally stay open until Cmd+Q.
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('activate', () => {
  if (mainWindow == null) createWindow();
  else restoreFullApp();
});
