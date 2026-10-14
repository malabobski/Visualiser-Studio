// Use this only for the transition release. Existing installs still poll the
// old repository; the first provider is embedded as their new update feed.
const config = require('../package.json').build;
module.exports = {
  ...config,
  publish: [
    ...config.publish,
    { provider: 'github', owner: 'malabobski', repo: 'Visualiser-Studio', releaseType: 'draft' }
  ]
};
