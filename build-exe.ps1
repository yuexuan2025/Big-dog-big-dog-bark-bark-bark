# 重新打包大狗Tap Windows 便携版 exe
# 依赖：Node.js（含 npm），首次需要联网下载 Electron / electron-builder 工具链
# 产出：dist\YuexuanDaGouTap-1.0.0-portable.exe

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# 国内镜像，避免 GitHub 超时
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'

# afterPack 用来给主 exe 写图标
$rcedit = 'C:\Users\10470\AppData\Local\Temp\electron-builder-cache\winCodeSign\rcedit-x64.exe'
if (-not (Test-Path $rcedit)) {
  $rcedit = 'C:\Users\10470\AppData\Local\electron-builder\Cache\winCodeSign\rcedit-x64.exe'
}
if (Test-Path $rcedit) { $env:RCEDIT_PATH = $rcedit }

if (-not (Test-Path 'node_modules\electron')) {
  Write-Host '安装依赖...'
  & npm install --no-fund --no-audit
}

Write-Host '打包中...'
& npm run build:win

$portable = 'dist\YuexuanDaGouTap-1.0.0-portable.exe'
if (-not (Test-Path $portable)) {
  throw "未找到输出：$portable"
}

# portable 外壳图标由 NSIS 写入；不要对 portable 再跑 rcedit，会截断 7z 尾部数据。
$size = (Get-Item $portable).Length
Write-Host ''
Write-Host "完成：$portable"
Write-Host "大小：$([math]::Round($size / 1MB, 1)) MB"
if ($size -lt 20MB) {
  throw "便携包异常偏小（$size bytes），打包可能失败"
}
