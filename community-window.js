// Return from a user-started browser sign-in. Restoring a minimized window is
// separate from showing it; Windows may otherwise keep Chrome in front.
function focusCommunityWindow({ app, win, platform = process.platform, schedule = setTimeout }) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  if (platform === 'darwin') app.focus({ steal: true });
  const raiseTemporarily = platform === 'win32' && !win.isAlwaysOnTop();
  if (raiseTemporarily) win.setAlwaysOnTop(true);
  win.moveTop();
  win.focus();
  if (raiseTemporarily) schedule(() => {
    if (!win.isDestroyed()) win.setAlwaysOnTop(false);
  }, 200);
  win.webContents.send('community:open');
}
module.exports = { focusCommunityWindow };
