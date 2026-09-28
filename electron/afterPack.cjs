'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

/**
 * electron-builder 在无签名证书时会跳过 rcedit，
 * 这里在封包前给主 exe 补上图标与版本信息（portable 外壳图标由 NSIS -XIcon 负责）。
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  if (!fs.existsSync(exePath)) return;

  const candidates = [
    process.env.RCEDIT_PATH,
    path.join(
      process.env.LOCALAPPDATA || '',
      'Temp',
      'electron-builder-cache',
      'winCodeSign',
      'rcedit-x64.exe'
    ),
    path.join(
      process.env.LOCALAPPDATA || '',
      'electron-builder',
      'Cache',
      'winCodeSign',
      'rcedit-x64.exe'
    ),
  ].filter(Boolean);

  const rcedit = candidates.find((p) => fs.existsSync(p));
  if (!rcedit) {
    console.log('[afterPack] 未找到 rcedit，跳过图标写入');
    return;
  }

  const icon = path.join(context.packager.projectDir, 'build', 'icon.ico');
  const version = context.packager.appInfo.version;
  const args = [
    exePath,
    '--set-icon', icon,
    '--set-version-string', 'ProductName', context.packager.appInfo.productName,
    '--set-version-string', 'FileDescription', context.packager.appInfo.description || context.packager.appInfo.productName,
    '--set-version-string', 'CompanyName', 'yuexuan',
    '--set-version-string', 'LegalCopyright', 'Copyright yuexuan',
    '--set-file-version', `${version}.0`,
    '--set-product-version', `${version}.0`,
  ];

  execFileSync(rcedit, args, { stdio: 'inherit' });
  console.log('[afterPack] 已写入图标与版本信息:', exePath);
};
