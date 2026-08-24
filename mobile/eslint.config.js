// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // El override para archivos .js de eslint-config-expo referencia un id
    // de regla que ya no existe en la versión instalada de
    // @typescript-eslint, lo que da error en cualquier .js plano -
    // metro.config.js es el único acá, así que se excluye en vez de
    // parchear node_modules.
    ignores: ["dist/*", "metro.config.js"],
  }
]);
