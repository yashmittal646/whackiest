// CMake 3.22's ninja cannot handle paths over 260 characters on Windows.
const { withAppBuildGradle } = require("expo/config-plugins");
module.exports = (config) => withAppBuildGradle(config, (c) => {
  c.modResults.contents += '\nandroid { externalNativeBuild { cmake { version "3.31.6" } } }\n';
  return c;
});
