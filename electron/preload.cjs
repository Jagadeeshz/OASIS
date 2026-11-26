'use strict';
// Preload: the only bridge between the renderer and the main process.
// No node modules, no fs, no secrets — just a validated IPC surface.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (!res || res.ok !== true) {
    const err = new Error(res?.error || `IPC ${channel} failed`);
    if (res?.validation) err.validation = res.validation;
    throw err;
  }
  return res.data;
}

const api = {
  app: {
    info: () => call('app:info'),
    diagnostics: () => call('diagnostics:run'),
  },
  projects: {
    list: (opts) => call('projects:list', opts),
    get: (id) => call('projects:get', id),
    create: (input) => call('projects:create', input),
    update: (id, patch) => call('projects:update', id, patch),
    archive: (id, archived) => call('projects:archive', id, archived),
    remove: (id) => call('projects:remove', id),
  },
  assets: {
    list: (opts) => call('assets:list', opts),
    get: (id) => call('assets:get', id),
    stats: (projectId) => call('assets:stats', projectId),
    tags: (projectId) => call('assets:tags', projectId),
    update: (id, patch) => call('assets:update', id, patch),
    archive: (id, archived) => call('assets:archive', id, archived),
    remove: (id, opts) => call('assets:remove', id, opts),
    versions: (id) => call('assets:versions', id),
    reveal: (id) => call('assets:reveal', id),
    saveCopy: (id) => call('assets:saveCopy', id),
    pickAndImport: (projectId, workspace) => call('assets:pickAndImport', projectId, workspace),
    importPath: (projectId, filePath, workspace) => call('assets:importPath', projectId, filePath, workspace),
  },
  jobs: {
    list: (opts) => call('jobs:list', opts),
    get: (id) => call('jobs:get', id),
    create: (input) => call('jobs:create', input),
    start: (id) => call('jobs:start', id),
    cancel: (id) => call('jobs:cancel', id),
    retry: (id) => call('jobs:retry', id),
    active: (projectId) => call('jobs:active', projectId),
  },
  models: {
    list: () => call('models:list'),
  },
  providers: {
    list: () => call('providers:list'),
    setEnabled: (id, enabled) => call('providers:setEnabled', id, enabled),
    save: (id, patch) => call('providers:save', id, patch),
    test: (id) => call('providers:test', id),
    enhance: (input) => call('providers:enhance', input),
    ollamaModels: () => call('providers:ollamaModels'),
  },
  workflows: {
    list: (projectId) => call('workflows:list', projectId),
    get: (id) => call('workflows:get', id),
    save: (input) => call('workflows:save', input),
    remove: (id) => call('workflows:remove', id),
    run: (input) => call('workflows:run', input),
    start: (input) => call('workflows:start', input),
    cancel: (runId) => call('workflows:cancel', runId),
    runs: (id, limit) => call('workflows:runs', id, limit),
  },
  timelines: {
    list: (projectId) => call('timelines:list', projectId),
    get: (id) => call('timelines:get', id),
    save: (input) => call('timelines:save', input),
    remove: (id) => call('timelines:remove', id),
    validate: (data) => call('timelines:validate', data),
  },
  exports: {
    list: (projectId) => call('exports:list', projectId),
    get: (id) => call('exports:get', id),
    create: (input) => call('exports:create', input),
    cancel: (id) => call('exports:cancel', id),
    remove: (id, opts) => call('exports:remove', id, opts),
    reveal: (id) => call('exports:reveal', id),
  },
  settings: {
    get: (key, fallback) => call('settings:get', key, fallback),
    set: (key, value) => call('settings:set', key, value),
  },
  logs: {
    list: (opts) => call('logs:list', opts),
    clear: () => call('logs:clear'),
  },
  shell: {
    openPath: (p) => call('shell:openPath', p),
    openExternal: (url) => call('shell:openExternal', url),
  },
  onEvent: (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on('oasis:event', handler);
    return () => ipcRenderer.removeListener('oasis:event', handler);
  },
  pathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return null;
    }
  },
};

contextBridge.exposeInMainWorld('oasis', api);
