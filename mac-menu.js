function installMacMenu({ Menu, app, showMain, requestExit }) {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'Visualiser Studio', submenu: [
      { role: 'about' }, { type: 'separator' },
      { label: 'Show Visualiser Studio', click: showMain },
      { role: 'services' }, { type: 'separator' },
      { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
      { label: 'Quit Visualiser Studio', accelerator: 'Command+Q', click: requestExit }
    ] },
    { label: 'Edit', submenu: [
      // The editor owns Command+Z/Shift+Z; native menu accelerators must not
      // intercept automation's independent undo history.
      { role: 'undo', accelerator: null }, { role: 'redo', accelerator: null },
      { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
    ] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }] }
  ]));
  app.setAboutPanelOptions({ applicationName: 'Visualiser Studio', applicationVersion: app.getVersion() });
}
module.exports = { installMacMenu };
