// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // eslint-config-expo's JS-file override references a rule id that no
    // longer exists in the installed @typescript-eslint version, which
    // errors out on any plain .js file - metro.config.js is the only one
    // here, so just exclude it rather than patch node_modules.
    ignores: ["dist/*", "metro.config.js"],
  }
]);
