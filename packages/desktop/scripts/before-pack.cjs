/**
 * electron-builder's `beforePack` hook. Windows builds ship the staged CLI as one archive
 * (`pack-cli.mjs`, DESKTOP-SPEC §9); macOS and Linux copy the stage directory as it is.
 * macOS builds compile the default-handler helper (§13) for the target architecture.
 */
const { execFileSync } = require('node:child_process');
const { mkdirSync } = require('node:fs');
const { join } = require('node:path');
const { Arch } = require('electron-builder');

exports.default = async function beforePack(context) {
  const desktopDir = join(__dirname, '..');
  if (context.electronPlatformName === 'darwin') {
    const arch = Arch[context.arch] === 'x64' ? 'x86_64' : Arch[context.arch];
    const out = join(desktopDir, 'build', 'native', 'default-handler');
    mkdirSync(join(out, '..'), { recursive: true });
    // macOS 12: the first with NSWorkspace.setDefaultApplication.
    execFileSync('swiftc', ['-O', '-target', `${arch}-apple-macos12.0`, join(desktopDir, 'native', 'default-handler.swift'), '-o', out], {
      stdio: 'inherit',
    });
    console.log(`seemore-desktop: compiled default-handler for ${arch}`);
  }
  if (context.electronPlatformName !== 'win32') return;
  const { packCli } = await import('./pack-cli.mjs');
  console.log('seemore-desktop: packing the staged CLI for Windows...');
  const { sha256 } = await packCli(join(desktopDir, 'build', 'stage', 'seemore'), join(desktopDir, 'build', 'archive'));
  console.log(`seemore-desktop: packed seemore-cli.tar.br (${sha256.slice(0, 16)})`);
};
