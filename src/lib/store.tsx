import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, Asset, Job, ModelInfo, Project, ProviderInfo } from './api';

export type NavKey =
  | 'dashboard'
  | 'canvas'
  | 'photocraft'
  | 'filmcraft'
  | 'effectscraft'
  | 'assets'
  | 'video'
  | 'projects'
  | 'providers'
  | 'jobs'
  | 'workflows'
  | 'storage'
  | 'exports'
  | 'settings'
  | 'logs';

export type Handoff = { assetId?: string; source?: string; at: number } | null;

type Toast = { id: number; msg: string; kind: 'info' | 'success' | 'error' | 'warn' };

type Ctx = {
  ready: boolean;
  info: any;
  projects: Project[];
  project: Project | null;
  projectId: string;
  selectProject: (id: string) => void;
  createProject: (name: string) => Promise<Project>;
  refreshProjects: () => Promise<void>;
  providers: ProviderInfo[];
  refreshProviders: () => Promise<void>;
  models: ModelInfo[];
  tasks: Record<string, { media: string; label: string }>;
  nodeTypes: Record<string, any>;
  assets: Asset[];
  assetsRev: number;
  refreshAssets: (opts?: Record<string, any>) => Promise<Asset[]>;
  jobs: Job[];
  refreshJobs: () => Promise<void>;
  exportsRev: number;
  workflowsRev: number;
  nav: NavKey;
  setNav: (n: NavKey) => void;
  handoff: Handoff;
  consumeHandoff: () => Handoff;
  sendAsset: (assetId: string, target: NavKey, source?: string) => void;
  toast: (msg: string, kind?: Toast['kind']) => void;
  toasts: Toast[];
};

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [info, setInfo] = useState<any>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [tasks, setTasks] = useState<Record<string, any>>({});
  const [nodeTypes, setNodeTypes] = useState<Record<string, any>>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetsRev, setAssetsRev] = useState(0);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [exportsRev, setExportsRev] = useState(0);
  const [workflowsRev, setWorkflowsRev] = useState(0);
  const [nav, setNav] = useState<NavKey>('dashboard');
  const [handoff, setHandoff] = useState<Handoff>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(1);

  const toast = useCallback((msg: string, kind: Toast['kind'] = 'info') => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const refreshProjects = useCallback(async () => {
    const list = await api.projects.list({});
    setProjects(list);
    return list;
  }, []);

  const refreshProviders = useCallback(async () => {
    setProviders(await api.providers.list());
  }, []);

  const refreshAssets = useCallback(
    async (opts: Record<string, any> = {}) => {
      if (!projectId) return [];
      const list: Asset[] = await api.assets.list({ projectId, limit: 400, ...opts });
      if (!opts.mediaType && !opts.search && !opts.tag) {
        setAssets(list);
        setAssetsRev((n) => n + 1);
      }
      return list;
    },
    [projectId],
  );

  const refreshJobs = useCallback(async () => {
    if (!projectId) return;
    setJobs(await api.jobs.list({ projectId, limit: 80 }));
  }, [projectId]);

  // Boot
  useEffect(() => {
    (async () => {
      try {
        if (!api) throw new Error('OASIS bridge unavailable — run the app through Electron');
        const [appInfo, modelsRes, list, provs] = await Promise.all([
          api.app.info(),
          api.models.list(),
          api.projects.list({}),
          api.providers.list(),
        ]);
        setInfo(appInfo);
        setModels(modelsRes.models);
        setTasks(modelsRes.tasks);
        setNodeTypes(modelsRes.nodeTypes);
        setProviders(provs);
        setProjects(list);
        const last = await api.settings.get('lastProjectId', null);
        let chosen = list.find((p: Project) => p.id === last) || list[0];
        if (!chosen) {
          chosen = await api.projects.create({ name: 'Welcome project', description: 'Created on first launch' });
          setProjects(await api.projects.list({}));
        }
        setProjectId(chosen.id);
        setReady(true);
      } catch (err: any) {
        toast(err.message || 'Failed to start', 'error');
        setReady(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Project switch
  useEffect(() => {
    if (!projectId) return;
    api.settings.set('lastProjectId', projectId).catch(() => {});
    refreshAssets().catch(() => {});
    refreshJobs().catch(() => {});
  }, [projectId, refreshAssets, refreshJobs]);

  // Live events from the main process
  useEffect(() => {
    if (!api?.onEvent) return;
    const off = api.onEvent((evt: any) => {
      if (!evt || !evt.type) return;
      if (evt.type === 'job:update' || evt.type === 'job:created') {
        const job: Job = evt.job;
        if (!job) return;
        setJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === job.id);
          if (idx === -1) return [job, ...prev].slice(0, 80);
          const next = [...prev];
          next[idx] = job;
          return next;
        });
        if (['succeeded', 'mock'].includes(job.status)) {
          refreshAssets().catch(() => {});
          setAssetsRev((n) => n + 1);
        }
        if (job.status === 'failed') toast(`Job failed: ${job.error}`, 'error');
      } else if (evt.type === 'assets:changed') {
        refreshAssets().catch(() => {});
      } else if (evt.type === 'providers:changed') {
        refreshProviders().catch(() => {});
      } else if (evt.type === 'export:update') {
        setExportsRev((n) => n + 1);
        if (evt.export?.status === 'succeeded') {
          toast('Export finished', 'success');
          refreshAssets().catch(() => {});
        }
        if (evt.export?.status === 'failed') toast(`Export failed: ${evt.export.error}`, 'error');
      } else if (evt.type === 'workflows:changed') {
        setWorkflowsRev((n) => n + 1);
      }
    });
    return () => off && off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshAssets, refreshProviders, toast]);

  const selectProject = useCallback((id: string) => setProjectId(id), []);

  const createProject = useCallback(
    async (name: string) => {
      const created = await api.projects.create({ name });
      await refreshProjects();
      setProjectId(created.id);
      return created;
    },
    [refreshProjects],
  );

  const sendAsset = useCallback((assetId: string, target: NavKey, source?: string) => {
    setHandoff({ assetId, source, at: Date.now() });
    setNav(target);
  }, []);

  const consumeHandoff = useCallback(() => {
    const h = handoff;
    setHandoff(null);
    return h;
  }, [handoff]);

  const project = useMemo(() => projects.find((p) => p.id === projectId) || null, [projects, projectId]);

  const value: Ctx = {
    ready,
    info,
    projects,
    project,
    projectId,
    selectProject,
    createProject,
    refreshProjects,
    providers,
    refreshProviders,
    models,
    tasks,
    nodeTypes,
    assets,
    assetsRev,
    refreshAssets,
    jobs,
    refreshJobs,
    exportsRev,
    workflowsRev,
    nav,
    setNav,
    handoff,
    consumeHandoff,
    sendAsset,
    toast,
    toasts,
  };

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useModelsFor(task: string) {
  const { models } = useApp();
  return useMemo(() => models.filter((m) => m.task === task), [models, task]);
}
