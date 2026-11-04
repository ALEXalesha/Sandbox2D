// Окно Sandbox2D на Electron: те же файлы web/, что в браузере.
//
// SB_TEST=1 - режим законов: окно не показывается, не берёт фокус и стоит за экраном;
// захват указателя и любые другие разрешения запрещены. Законы управляют им через Playwright,
// и на экране пользователя не появляется ни одного окна.
'use strict';
const { app, BrowserWindow, Menu, screen, session } = require('electron');
const path = require('path');
const WindowState = require('./window-state');

const TEST = process.env.SB_TEST === '1';
const SIZE = { width: 1280, height: 760, minWidth: 360, minHeight: 480 };
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
let win = null;

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const areas = [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea);
  const placed = WindowState.restore(WindowState.load(stateFile()), areas, SIZE);
  win = new BrowserWindow({
    ...(TEST ? { x: -20000, y: -20000 } : placed.x !== undefined ? { x: placed.x, y: placed.y } : {}),
    width: placed.width,
    height: placed.height,
    minWidth: SIZE.minWidth,
    minHeight: SIZE.minHeight,
    title: 'Sandbox2D',
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    backgroundColor: '#12101f',
    show: false,
    focusable: !TEST,
    skipTaskbar: TEST,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'web', 'index.html'));
  if (!TEST) {
    if (placed.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
  }
  const remember = () => { if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen() && !TEST) WindowState.save(stateFile(), WindowState.capture(win)); };
  for (const event of ['resized', 'moved', 'maximize', 'unmaximize']) win.on(event, remember);
  win.on('close', () => { if (win && !TEST && !win.isFullScreen()) WindowState.save(stateFile(), WindowState.capture(win)); });
  win.on('closed', () => { win = null; });
  // F11 - во весь экран; ссылки не открываются внутри приложения; со страницы игры не уйти
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

// в законах (и на машинах без видеокарты) WebGL идёт через программный SwiftShader
if (TEST || process.env.SB_SOFTWARE_GL === '1') {
  app.commandLine.appendSwitch('use-gl', 'angle');
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  app.on('second-instance', () => {
    if (!win || TEST) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    // Игре не нужны разрешения: захват указателя, камера, уведомления - всё запрещено.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
