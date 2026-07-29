# Audio Visualiser Studio

Turn any audio file into a WEBM visualiser video — now packaged as a proper desktop app.

## Running it while you're developing

1. Install [Node.js](https://nodejs.org) if you don't already have it.
2. Open a terminal in this folder and run:
   ```
   npm install
   npm run electron
   ```
   This opens the app in its own window. FFmpeg is bundled automatically — you don't need to install it separately.

## Building an installer (the thing people download)

```
npm run dist
```

This creates a real installer for your current operating system in a new `dist` folder — a `.exe` on Windows, a `.dmg` on Mac, an `.AppImage` on Linux. That's the file you'd upload to GitHub for people to download.

> Note: you can only build installers for the operating system you're currently on, unless you set up a separate build machine or CI service for the others later.

## What changed from the old version

- The app used to require you to have FFmpeg installed on your computer separately. Now a copy of FFmpeg is bundled inside the app itself, so it just works out of the box.
- The app used to only run as a local website you opened in your browser (via `Start Audio Visualiser.bat`). It now also runs as a real desktop app window, via Electron.
- The old way (`npm start`, then opening `http://localhost:3000` in a browser) still works too, if you ever want to test something quickly.
