'use strict';

const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, shell } = require('electron');

const isDev = !app.isPackaged;
let mainWindow = null;

function resolvePageUrl() {
  // loadFile 在中文路径 + asar 下偶发被解析成错误 URL，这里显式转 file://
  return pathToFileURL(path.join(__dirname, '..', 'index.html')).href;
}

function setupWindowOpenHandler(win) {
  // 外部链接交给系统浏览器，且仅放行 https，降低被拉起任意协议的风险。
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') {
        shell.openExternal(parsed.href);
      }
    } catch (_) {
      /* 非法 URL 直接忽略 */
    }
    return { action: 'deny' };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 920,
    height: 640,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#fff2dc',
    title: '大狗Tap · yuexuan',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  setupWindowOpenHandler(mainWindow);
  mainWindow.loadURL(resolvePageUrl());

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[大狗Tap] 页面加载失败', code, desc, url);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
