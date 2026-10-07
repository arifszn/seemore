/**
 * electron-builder's `beforePack` hook: Windows builds ship the staged CLI as one archive
 * (`pack-cli.mjs`, DESKTOP-SPEC §9); macOS and Linux copy the stage directory as it is.
 */
const { join } = require('node:path');

exports.default = async function beforePack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const desktopDir = join(__dirname, '..');
  const { packCli } = await import('./pack-cli.mjs');
  console.log('seemore-desktop: packing the staged CLI for Windows...');
  const { sha256 } = await packCli(join(desktopDir, 'build', 'stage', 'seemore'), join(desktopDir, 'build', 'archive'));
  console.log(`seemore-desktop: packed seemore-cli.tar.br (${sha256.slice(0, 16)})`);
};
