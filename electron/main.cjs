'use strict';
// OASIS desktop main process: window, protocols, service wiring and IPC surface.
const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog, safeStorage, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const { openDatabase } = require('./services/db.cjs');
const { AssetService } = require('./services/assets.cjs');
const { SecretVault } = require('./services/vault.cjs');
const { SettingsService } = require('./services/settings.cjs');
const { ProjectService } = require('./services/projects.cjs');
const { JobService } = require('./services/jobs.cjs');
const { WorkflowService, NODE_TYPES } = require('./services/workflow.cjs');
const { TimelineService } = require('./services/timeline.cjs');
const { ExportService } = require('./services/exporter.cjs');
const catalog = require('./services/providers/catalog.cjs');
const media = require('./services/media.cjs');
const deepseek = require('./services/providers/deepseek.cjs');
const ollama = require('./services/providers/ollama.cjs');
const falAdapter = require('./services/providers/fal.cjs');

const isDev = !!process.env.OASIS_DEV_SERVER;
const APP_VERSION = require('../package.json').version;

// One OASIS process per machine: the SQLite file and media store are single-writer.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'oasis-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  { scheme: 'oasis-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
]);

let win = null;
let services = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function emitEvent(event) {
  send('oasis:event', event);
}

async function initServices() {
  const userData = app.getPath('userData');
  const storageRoot = path.join(userData, 'storage');
  fs.mkdirSync(storageRoot, { recursive: true });

  const wasmCandidates = [
    path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(process.resourcesPath || '', 'sql-wasm.wasm'),
  ];
  const wasmPath = wasmCandidates.find((p) => p && fs.existsSync(p));
  if (!wasmPath) throw new Error('sql-wasm.wasm not found — cannot start the database');

  const db = await openDatabase({ file: path.join(userData, 'oasis.db'), wasmPath });
  const vault = new SecretVault({ file: path.join(userData, 'vault.json'), safeStorage: safeStorage.isEncryptionAvailable() ? safeStorage : null });
  const assets = new AssetService(db, { root: storageRoot });
  const settings = new SettingsService({ db, vault, adapters: { fal: falAdapter, deepseek, ollama }, onEvent: emitEvent });
  const projects = new ProjectService({ db });
  const jobs = new JobService({ db, assets, settings, vault, onEvent: emitEvent });
  const workflows = new WorkflowService({ db, jobs, assets, settings, onEvent: emitEvent });
  const timelines = new TimelineService({ db, assets });
  const exporter = new ExportService({ db, assets, settings, outDir: path.join(userData, 'exports'), onEvent: emitEvent, appVersion: APP_VERSION });

  services = { db, vault, assets, settings, projects, jobs, workflows, timelines, exporter, userData, storageRoot, wasmPath };
  services.dbPath = path.join(userData, 'oasis.db');
  return services;
}

/** Serve asset bytes (with HTTP range support so <video> can seek). */
async function serveFile(filePath, request) {
  if (!filePath || !fs.existsSync(filePath)) return new Response('Not found', { status: 404 });
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.json': 'application/json',
  };
  const type = types[ext] || 'application/octet-stream';
  const range = request.headers.get('range');
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Math.min(Number(m[2]), stat.size - 1) : stat.size - 1;
      if (start >= stat.size) return new Response('Range not satisfiable', { status: 416 });
      const chunk = fs.readFileSync(filePath).subarray(start, end + 1);
      return new Response(chunk, {
        status: 206,
        headers: {
          'content-type': type,
          'content-length': String(chunk.length),
          'content-range': `bytes ${start}-${end}/${stat.size}`,
          'accept-ranges': 'bytes',
          'cache-control': 'no-cache',
        },
      });
    }
  }
  return new Response(fs.readFileSync(filePath), {
    status: 200,
    headers: { 'content-type': type, 'content-length': String(stat.size), 'accept-ranges': 'bytes', 'cache-control': 'no-cache' },
  });
}

function registerProtocols() {
  protocol.handle('oasis-asset', async (request) => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
      if (!id) return new Response('Bad request', { status: 400 });
      const file = url.hostname === 'thumb' ? services.assets.thumbnailPath(id) : services.assets.absolutePath(id);
      return await serveFile(file, request);
    } catch (err) {
      return new Response(`Asset error: ${err.message}`, { status: 500 });
    }
  });
  protocol.handle('oasis-file', async (request) => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.pathname.replace(/^\//, ''));
      const row = services.db.get('SELECT output_path FROM exports WHERE id = ?', [id]);
      return await serveFile(row?.output_path, request);
    } catch (err) {
      return new Response(`File error: ${err.message}`, { status: 500 });
    }
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 940,
    minWidth: 1120,
    minHeight: 720,
    show: false,
    backgroundColor: '#0a0c11',
    title: 'OASIS',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    const allowed = isDev ? String(url).startsWith(process.env.OASIS_DEV_SERVER) : String(url).startsWith('file://');
    if (!allowed) e.preventDefault();
  });

  if (isDev) {
    win.loadURL(process.env.OASIS_DEV_SERVER);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // While running from source, stale Chromium cache could serve an older bundle after a rebuild.
    if (!app.isPackaged) win.webContents.session.clearCache().catch(() => {});
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
  win.on('closed', () => {
    win = null;
  });
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Open storage folder', click: () => shell.openPath(services.storageRoot) },
        { label: 'Open exports folder', click: () => shell.openPath(path.join(services.userData, 'exports')) },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'OASIS documentation', click: () => shell.openPath(path.join(__dirname, '..', 'docs')) },
        { label: `Version ${APP_VERSION}`, enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------- IPC ----------
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err?.message || String(err), validation: err?.validation || null };
    }
  });
}

function registerIpc() {
  const { projects, assets, jobs, workflows, timelines, exporter, settings, vault, db } = services;

  handle('app:info', () => ({
    version: APP_VERSION,
    platform: process.platform,
    paths: { userData: services.userData, storage: services.storageRoot, db: services.dbPath, exports: path.join(services.userData, 'exports') },
    ffmpeg: { available: media.ffmpegAvailable(), version: media.ffmpegVersion() },
    encryption: { available: vault.encryptionAvailable() },
    dev: isDev,
    electron: process.versions.electron,
    node: process.versions.node,
  }));

  handle('projects:list', (opts) => projects.list(opts || {}));
  handle('projects:get', (id) => projects.get(id));
  handle('projects:create', (input) => projects.create(input || {}));
  handle('projects:update', (id, patch) => projects.update(id, patch || {}));
  handle('projects:archive', (id, archived) => projects.archive(id, archived !== false));
  handle('projects:remove', (id) => projects.remove(id));

  handle('assets:list', (opts) => assets.list(opts || {}));
  handle('assets:get', (id) => assets.get(id));
  handle('assets:stats', (projectId) => assets.count(projectId));
  handle('assets:tags', (projectId) => assets.tags(projectId));
  handle('assets:update', (id, patch) => assets.update(id, patch || {}));
  handle('assets:archive', (id, archived) => assets.archive(id, archived !== false));
  handle('assets:remove', (id, opts) => assets.remove(id, opts || {}));
  handle('assets:versions', (id) => assets.versions(id));
  handle('assets:reveal', (id) => {
    const file = assets.absolutePath(id);
    if (!file) throw new Error('Asset file not found');
    shell.showItemInFolder(file);
    return true;
  });

  handle('assets:saveCopy', async (id) => {
    const asset = assets.get(id);
    if (!asset) throw new Error('Asset not found');
    const res = await dialog.showSaveDialog(win, {
      title: 'Save a copy',
      defaultPath: path.join(app.getPath('downloads'), asset.filename),
    });
    if (res.canceled || !res.filePath) return null;
    fs.copyFileSync(asset.storage_path, res.filePath);
    return res.filePath;
  });

  handle('assets:pickAndImport', async (projectId, workspace) => {
    if (!projectId) throw new Error('projectId is required');
    const result = await dialog.showOpenDialog(win, {
      title: 'Import media into Asset Studio',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'webm', 'mov', 'mp3', 'wav', 'm4a'] },
      ],
    });
    if (result.canceled) return [];
    const created = [];
    for (const file of result.filePaths) {
      created.push(assets.importFile(file, { projectId, sourceWorkspace: workspace || 'import', displayName: path.basename(file) }));
    }
    emitEvent({ type: 'assets:changed' });
    return created;
  });

  handle('assets:importPath', (projectId, filePath, workspace) => {
    if (!projectId || !filePath) throw new Error('projectId and path are required');
    if (!fs.existsSync(filePath)) throw new Error('File not found');
    if (!fs.statSync(filePath).isFile()) throw new Error('Not a file');
    const asset = assets.importFile(filePath, { projectId, sourceWorkspace: workspace || 'import', displayName: path.basename(filePath) });
    emitEvent({ type: 'assets:changed' });
    return asset;
  });

  handle('jobs:list', (opts) => jobs.list(opts || {}));
  handle('jobs:get', (id) => jobs.get(id));
  handle('jobs:create', (input) => jobs.create(input || {}));
  handle('jobs:start', (id) => jobs.start(id));
  handle('jobs:cancel', (id) => jobs.cancel(id));
  handle('jobs:retry', (id) => jobs.retry(id));
  handle('jobs:active', (projectId) => jobs.activeCount(projectId));

  handle('models:list', () => ({ models: catalog.ALL_MODELS, tasks: catalog.TASKS, nodeTypes: NODE_TYPES }));

  handle('providers:list', () => settings.listProviders());
  handle('providers:setEnabled', (id, enabled) => settings.setEnabled(id, !!enabled));
  handle('providers:save', (id, patch) => settings.saveConfig(id, patch || {}));
  handle('providers:test', (id) => settings.testProvider(id));
  handle('providers:enhance', async ({ prompt, mode, provider }) => {
    const chosen = provider || (settings.usable('deepseek').usable ? 'deepseek' : null);
    if (!chosen) throw new Error('Prompt enhancement needs DeepSeek or Ollama enabled and configured');
    const cfg = settings.publicConfig(chosen);
    const secret = vault.get(chosen);
    if (chosen === 'deepseek') return deepseek.enhancePrompt({ prompt, mode, secret, baseUrl: cfg.baseUrl, model: cfg.model });
    if (chosen === 'ollama') return ollama.enhancePrompt({ prompt, endpoint: cfg.endpoint, model: cfg.model });
    throw new Error(`Prompt enhancement is not supported by ${chosen}`);
  });
  handle('providers:ollamaModels', () => ollama.listModels({ endpoint: settings.publicConfig('ollama').endpoint }));

  handle('workflows:list', (projectId) => workflows.list(projectId));
  handle('workflows:get', (id) => workflows.get(id));
  handle('workflows:save', (input) => workflows.save(input || {}));
  handle('workflows:remove', (id) => workflows.remove(id));
  handle('workflows:run', (input) => workflows.run(input || {}));
  handle('workflows:cancel', (runId) => workflows.cancel(runId));
  handle('workflows:runs', (id, limit) => workflows.runs(id, limit));

  handle('timelines:list', (projectId) => timelines.list(projectId));
  handle('timelines:get', (id) => timelines.get(id));
  handle('timelines:save', (input) => timelines.save(input || {}));
  handle('timelines:remove', (id) => timelines.remove(id));
  handle('timelines:validate', (data) => timelines.validate(data));

  handle('exports:list', (projectId) => exporter.list(projectId));
  handle('exports:get', (id) => exporter.get(id));
  handle('exports:create', (input) => {
    const tl = input.timelineId ? timelines.get(input.timelineId) : null;
    const data = input.timeline || tl?.data;
    return exporter.create({ projectId: input.projectId, timelineId: input.timelineId, timeline: data, name: input.name || tl?.name });
  });
  handle('exports:cancel', (id) => exporter.cancel(id));
  handle('exports:reveal', (id) => {
    const row = db.get('SELECT output_path FROM exports WHERE id = ?', [id]);
    if (!row?.output_path || !fs.existsSync(row.output_path)) throw new Error('Export file not found');
    shell.showItemInFolder(row.output_path);
    return true;
  });

  handle('settings:get', (key, fallback) => settings.getSetting(key, fallback));
  handle('settings:set', (key, value) => settings.setSetting(key, value));
  handle('logs:list', (opts) => settings.logs(opts || {}));
  handle('logs:clear', () => settings.clearLogs());

  handle('diagnostics:run', () => {
    const providers = settings.listProviders();
    return {
      app: { version: APP_VERSION, userData: services.userData, dev: isDev },
      database: { path: services.dbPath, size: fs.existsSync(services.dbPath) ? fs.statSync(services.dbPath).size : 0, projects: db.get('SELECT COUNT(*) AS n FROM projects').n },
      storage: { root: services.storageRoot, assets: db.get('SELECT COUNT(*) AS n FROM assets WHERE deleted_at IS NULL').n },
      ffmpeg: { available: media.ffmpegAvailable(), version: media.ffmpegVersion() },
      providers: providers.map((p) => ({ id: p.id, enabled: p.enabled, status: p.status, hasSecret: p.hasSecret })),
      encryption: vault.encryptionAvailable() ? 'os-backed' : 'unavailable (keys obfuscated only)',
      models: catalog.ALL_MODELS.length,
    };
  });

  handle('shell:openPath', async (target) => {
    const allowed = [services.userData, services.storageRoot];
    if (!allowed.some((p) => path.resolve(target).startsWith(path.resolve(p)))) throw new Error('Path is outside the OASIS data directory');
    return shell.openPath(target);
  });
  handle('shell:openExternal', (url) => {
    if (!/^https:\/\//i.test(String(url))) throw new Error('Only https links can be opened');
    return shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  try {
    await initServices();
    registerProtocols();
    registerIpc();
    buildMenu();
    createWindow();
  } catch (err) {
    dialog.showErrorBox('OASIS failed to start', `${err.stack || err.message}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (services?.db) {
    try {
      services.db.close();
    } catch {
      /* ignore */
    }
  }
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    services?.db?.close();
  } catch {
    /* ignore */
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
