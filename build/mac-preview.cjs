const config = require('../package.json').build;
module.exports = {
  ...config,
  appId: 'com.malchim.audiovisualiser.macpreview',
  productName: 'Visualiser Studio Mac Preview',
  extraMetadata: { version: '1.2.9-mac.3', visualiserMacPreview: true },
  directories: { output: 'dist/mac-preview' },
  mac: { ...config.mac, identity: '-', hardenedRuntime: false, notarize: false },
  publish: null
};
