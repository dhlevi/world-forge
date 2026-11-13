/**
 * The Electron main process: one window holding the game (apps/game), served from the app's
 * own files over the app:// scheme (module workers will not load from file://), or from the
 * Vite dev server while developing. The page reaches the computer only through the few calls
 * the preload script offers (preload.cts): opening a world file, and reading and writing the
 * game's own files in its data folder.
 */
import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, type MenuItemConstructorOptions } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
/** The Vite dev server to load instead of the built game (scripts/dev.mjs sets it). */
const DEV_URL = process.env.WF_DEV_URL;
const APP_ORIGIN = 'app://game';
/** The built game, copied in by scripts/renderer.mjs. */
const RENDERER = path.join(app.getAppPath(), 'renderer');

// One data folder whatever the build is called (in development the app's name is the package's).
app.setName('World Forge Wanderer');
app.setPath('userData', path.join(app.getPath('appData'), 'World Forge Wanderer'));

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
]);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' data: blob:",
  "font-src 'self' data:",
].join('; ');

/** Serves app://game/<path> from the built game, never outside it. */
function serveRenderer(): void {
  protocol.handle('app', async (req) => {
    const url = new URL(req.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(RENDERER, rel));
    if (!file.startsWith(RENDERER + path.sep)) return new Response('Not found', { status: 404 });
    try {
      await fs.access(file);
    } catch {
      return new Response('Not found', { status: 404 });
    }
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    if (file.endsWith('.html')) headers.set('Content-Security-Policy', CSP);
    return new Response(res.body, { status: res.status, headers });
  });
}

// ---- The data folder ---------------------------------------------------------------------------

/** The game's files (saves, settings, later cached chunks) live here and nowhere else. */
const dataDir = () => path.join(app.getPath('userData'), 'data');

/** A data file's path from a name such as "settings.json" or "saves/forge-1.json". */
function dataPath(name: unknown): string {
  if (typeof name !== 'string' || !/^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i.test(name) || name.includes('..') || name.length > 200) {
    throw new Error(`Not a data file name: ${String(name)}`);
  }
  return path.join(dataDir(), ...name.split('/'));
}

function registerIpc(): void {
  ipcMain.handle('wf:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
    dataDir: dataDir(),
  }));

  ipcMain.handle('wf:openWorldFile', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const opts: Electron.OpenDialogOptions = {
      title: 'Open a world file',
      properties: ['openFile'],
      filters: [{ name: 'World files', extensions: ['world', 'json'] }, { name: 'All files', extensions: ['*'] }],
    };
    const r = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (r.canceled || !r.filePaths[0]) return null;
    const file = r.filePaths[0];
    const stat = await fs.stat(file);
    if (stat.size > 1_000_000) throw new Error('That file is too large to be a world file.');
    return { name: path.basename(file), text: await fs.readFile(file, 'utf8') };
  });

  ipcMain.handle('wf:read', async (_e, name: unknown) => {
    try {
      return await fs.readFile(dataPath(name), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  });

  ipcMain.handle('wf:write', async (_e, name: unknown, text: unknown) => {
    if (typeof text !== 'string') throw new Error('Data files hold text.');
    const file = dataPath(name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    // Write beside and rename, so a crash never leaves half a file.
    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, text, 'utf8');
    await fs.rename(tmp, file);
    return true;
  });

  ipcMain.handle('wf:list', async (_e, dir: unknown) => {
    const d = dir === '' || dir === undefined ? dataDir() : dataPath(dir);
    try {
      return (await fs.readdir(d, { withFileTypes: true })).filter((x) => x.isFile() && !x.name.endsWith('.tmp')).map((x) => x.name).sort();
    } catch {
      return [];
    }
  });

  ipcMain.handle('wf:remove', async (_e, name: unknown) => {
    await fs.rm(dataPath(name), { force: true });
    return true;
  });

  ipcMain.handle('wf:showData', () => shell.openPath(dataDir()));

  ipcMain.handle('wf:quit', () => app.quit());
}

// ---- The window ----------------------------------------------------------------------------------

interface WindowState { x?: number; y?: number; width: number; height: number; maximized?: boolean; fullScreen?: boolean }

const stateFile = () => path.join(app.getPath('userData'), 'window.json');

async function loadState(): Promise<WindowState> {
  try {
    const s = JSON.parse(await fs.readFile(stateFile(), 'utf8')) as WindowState;
    if (s.width >= 640 && s.height >= 480) return s;
  } catch {
    // First run.
  }
  return { width: 1360, height: 860 };
}

function keepState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (win.isDestroyed()) return;
      const b = win.getNormalBounds();
      const s: WindowState = { ...b, maximized: win.isMaximized(), fullScreen: win.isFullScreen() };
      void fs.writeFile(stateFile(), JSON.stringify(s)).catch(() => {});
    }, 400);
  };
  for (const ev of ['resize', 'move', 'maximize', 'unmaximize', 'enter-full-screen', 'leave-full-screen'] as const) win.on(ev as 'resize', save);
}

async function createWindow(): Promise<void> {
  const st = await loadState();
  const win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width, height: st.height, minWidth: 800, minHeight: 560,
    backgroundColor: '#0d0f14',
    title: 'World Forge Wanderer',
    show: false,
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  if (st.maximized) win.maximize();
  if (st.fullScreen) win.setFullScreen(true);
  keepState(win);
  win.once('ready-to-show', () => win.show());

  // The page stays on the game: links open in the browser, nothing else navigates.
  const home = DEV_URL ? new URL(DEV_URL).origin : APP_ORIGIN;
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (new URL(url).origin !== home) e.preventDefault();
  });

  if (DEV_URL) await win.loadURL(DEV_URL);
  else await win.loadURL(`${APP_ORIGIN}/index.html`);
}

function buildMenu(): void {
  const send = (what: string) => BrowserWindow.getFocusedWindow()?.webContents.send('wf:menu', what);
  const isMac = process.platform === 'darwin';
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open World File…', accelerator: 'CmdOrCtrl+O', click: () => send('open-world') },
        { label: 'Save Game', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Show Data Folder', click: () => void shell.openPath(dataDir()) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen', accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11' },
        ...(DEV_URL || !app.isPackaged ? [{ type: 'separator' as const }, { role: 'reload' as const }, { role: 'toggleDevTools' as const }] : []),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'About World Forge Wanderer', click: () => void dialog.showMessageBox({ title: 'World Forge Wanderer', message: `World Forge Wanderer ${app.getVersion()}`, detail: `Electron ${process.versions.electron}, Chromium ${process.versions.chrome}` }) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
  app
    .whenReady()
    .then(async () => {
      serveRenderer();
      registerIpc();
      buildMenu();
      await createWindow();
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
      });
    })
    .catch((e: unknown) => {
      dialog.showErrorBox('World Forge Wanderer could not start', e instanceof Error ? e.message : String(e));
      app.quit();
    });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
