// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Metro only watches the project root by default. `shared/` lives one level
// up (see CLAUDE.md: plain .ts files imported by relative path, no package,
// same convention backend/ and web/ already use), so it has to be added
// explicitly or imports like `../../shared/fuel` fail to resolve.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];

module.exports = config;
