// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Metro por defecto solo observa la raíz del proyecto. `shared/` vive un
// nivel arriba (ver CLAUDE.md: archivos .ts planos importados por ruta
// relativa, sin package, misma convención que ya usan backend/ y web/), así
// que hay que agregarlo explícitamente o imports como `../../shared/fuel`
// fallan al resolver.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];

// El backend web de expo-sqlite (wa-sqlite) importa un archivo .wasm
// directamente. Metro trata las extensiones desconocidas como código fuente
// por defecto, lo que falla al resolver wa-sqlite.wasm — necesita pasar por
// el pipeline de assets en su lugar.
config.resolver.assetExts.push('wasm');

module.exports = config;
