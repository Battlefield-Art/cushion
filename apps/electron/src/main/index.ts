import { app, BrowserWindow, ipcMain, nativeImage, session, shell } from 'electron';
import './pdf-export';
import { join } from 'path';

const isLinux = process.platform === 'linux';

if (isLinux) {
  app.disableHardwareAcceleration();
}
import windowStateKeeper from 'electron-window-state';
import { initCoordinator, stopCoordinator } from './coordinator/ipc-router';
import { startOpenCodeServer, stopOpenCodeServer } from './coordinator/opencode-server';

const iconExt = process.platform === 'win32' ? 'icon.ico' : 'icon.png';
const iconPath = app.isPackaged
  ? join(process.resourcesPath, iconExt)
  : join(__dirname, '../../build', iconExt);

let mainWindow: BrowserWindow | null = null;

function extractPathArg(args: string[]): string | undefined {
  return args.find((arg) => !arg.startsWith('-') && arg !== process.execPath && arg !== '.');
}

function focusAndOpenWorkspace(path: string) {
  if (!mainWindow) {
    pendingOpenPath = path;
    return;
  }
  mainWindow.webContents.send('open-workspace', path);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

let pendingOpenPath: string | undefined;

function createWindow() {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 820,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    minWidth: 800,
    minHeight: 600,
    icon: nativeImage.createFromPath(iconPath),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    ...(isLinux
      ? {}
      : {
          titleBarStyle: 'hidden' as const,
          titleBarOverlay: {
            color: '#262626',
            symbolColor: '#dadada',
            height: 40,
          },
        }),
    show: false,
  });

  mainWindowState.manage(mainWindow);

  if (isLinux) {
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setAutoHideMenuBar(true);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const isCloseTabShortcut =
      input.type === 'keyDown' &&
      input.key.toLowerCase() === 'w' &&
      (input.control || input.meta) &&
      !input.alt &&
      !input.shift;

    if (!isCloseTabShortcut) return;

    event.preventDefault();
    mainWindow?.webContents.send('shortcut:close-current-tab');
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    if (pendingOpenPath) {
      mainWindow?.webContents.send('open-workspace', pendingOpenPath);
      pendingOpenPath = undefined;
    }
  });
}

function loadRenderer() {
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow!.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow!.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

ipcMain.handle('titlebar:update-theme', (_event, colors: { color: string; symbolColor: string }) => {
  if (!isLinux) mainWindow?.setTitleBarOverlay(colors);
});

ipcMain.handle('window:minimize', () => mainWindow?.minimize());
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window:close', () => mainWindow?.close());

ipcMain.handle('workspace:opened', (_event, projectPath: string) => {
  app.addRecentDocument(projectPath);
});

app.on('open-file', (event, path) => {
  event.preventDefault();
  focusAndOpenWorkspace(path);
});

app.on('second-instance', (_event, commandLine) => {
  const openPath = extractPathArg(commandLine.slice(1));
  if (openPath) focusAndOpenWorkspace(openPath);
});

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  const cliPath = extractPathArg(process.argv.slice(1));
  if (cliPath) {
    pendingOpenPath = cliPath;
  }

  createWindow();
  await startOpenCodeServer();
  await initCoordinator(mainWindow!);
  loadRenderer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopCoordinator();
  stopOpenCodeServer();
});
