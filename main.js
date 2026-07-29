// This is the "front door" of the desktop app. Electron runs this file first.
// It figures out where the bundled FFmpeg lives, starts the same local server
// your app already used, and opens a window pointed at it.

const { app, BrowserWindow } = require('electron');

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
let mainWindow;

async function createWindow() {
  const { startServer } = require('./server.js');

  // Start the same server.js logic as before, but tell it which ffmpeg to use.
  await startServer({ port: PORT, ffmpegBin: resolveFfmpegPath() });

  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#10121b',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  // On Windows/Linux, quit fully when the window closes.
  // On Mac, apps conventionally stay open until Cmd+Q.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
