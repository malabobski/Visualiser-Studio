// This is the "front door" of the desktop app. Electron runs this file first.
// It figures out where the bundled FFmpeg lives, starts the same local server
// your app already used, and opens a window pointed at it.

const { app, BrowserWindow, screen, session, desktopCapturer, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fsp = require('fs/promises');
const RPC = require('discord-rpc');

const APP_TITLE = 'Visualiser Studio';
const ICON_PATH = path.join(__dirname, 'build', 'icon.png');

// Discord Application ID (from the Discord Developer Portal). The public key
// there is for the HTTP Interactions endpoint, a different feature — Rich
// Presence over discord-rpc's local IPC transport only needs this ID.
const DISCORD_CLIENT_ID = '1047543674596249680';

let discordClient;
let discordReady = false;
const activityStart = Date.now();
let pendingDiscordActivity={details:'Getting things ready…',state:'Visualiser Studio'};
let discordLastKey='',discordLastSent=0,discordTimer;
function flushDiscordActivity(){
  if(!discordReady || !discordClient)return;
  const key=JSON.stringify(pendingDiscordActivity);
  if(key===discordLastKey)return;
  clearTimeout(discordTimer);
  const wait=Math.max(0,4000-(Date.now()-discordLastSent));
  if(wait){discordTimer=setTimeout(flushDiscordActivity,wait);return;}
  discordLastKey=key;discordLastSent=Date.now();
  discordClient.setActivity({...pendingDiscordActivity,startTimestamp:activityStart,largeImageKey:'app_icon',instance:false}).catch(()=>{discordLastKey='';});
}

// Connects to the local Discord desktop client over IPC. If Discord isn't
// running, login() just rejects and we quietly do nothing — Rich Presence
// is a nice-to-have, never something the app should depend on.
function setupDiscordRPC() {
  RPC.register(DISCORD_CLIENT_ID);
  discordClient = new RPC.Client({ transport: 'ipc' });

  discordClient.on('ready', () => {
    discordReady = true;
    flushDiscordActivity();
  });

  discordClient.login({ clientId: DISCORD_CLIENT_ID }).catch((err) => {
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
let mainAppPort;
let miniOpacity=1;

// --- Live section: system audio loopback -----------------------------------
// getDisplayMedia({audio:true}) normally pops the OS "pick a window/screen"
// dialog. Providing our own handler skips that dialog entirely and lets us
// hand back a fixed video source (any one screen — the renderer never shows
// the video, it only wants the accompanying loopback audio track) plus
// audio:'loopback', which on Windows captures whatever's currently playing
// system-wide.
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
function setupNowPlaying(win) {
  if (process.platform !== 'win32') return;

  let lastPayload = null;
  const send = (payload) => {
    lastPayload = payload;
    if (win && !win.isDestroyed()) win.webContents.send('now-playing:update', payload);
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('now-playing:update', payload);
  };
  ipcMain.handle('now-playing:get', () => lastPayload);

  // Same reasoning as resolveFfmpegPath() above: when packaged, __dirname
  // points inside the compressed app.asar, and powershell.exe (an external
  // process, not Node's own asar-aware fs) can't open a file from in there.
  // package.json's "asarUnpack" leaves a real copy at the matching
  // ".asar.unpacked" path, so point at that instead when it applies.
  let scriptPath = path.join(__dirname, 'now-playing.ps1');
  if (scriptPath.includes('app.asar')) {
    scriptPath = scriptPath.replace('app.asar', 'app.asar.unpacked');
  }
  ipcMain.handle('now-playing:control', async (_event, action, position) => {
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
  miniWindow=new BrowserWindow({width:454,height:244,minWidth:340,minHeight:220,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,resizable:false,show:false,skipTaskbar:false,title:'Visualiser Studio · Mini player',webPreferences:{contextIsolation:true,preload:path.join(__dirname,'preload.js')}});
  miniWindow.setOpacity(miniOpacity);
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
  const { port: activePort } = await startServer({ port: PORT, ffmpegBin: resolveFfmpegPath() });

  mainAppPort=activePort;
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    icon: ICON_PATH,
    width: 1320,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#10121b',
    autoHideMenuBar: true,
    frame: false,
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
    mainWindow.webContents.setVisualZoomLevelLimits(1, 1);
    mainWindow.setTitle(APP_TITLE);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupSystemAudioLoopback();
  setupNowPlaying(mainWindow);
}

app.whenReady().then(() => {
  setupDiscordRPC();
  createWindow();
});

app.on('before-quit', () => {
  discordClient?.destroy().catch(() => {});
});

app.on('window-all-closed', () => {
  if (nowPlayingProcess) nowPlayingProcess.kill();
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
  if (mainWindow === null) createWindow();
});
