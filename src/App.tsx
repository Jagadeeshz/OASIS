import React, { useEffect } from 'react';
import { NavKey, useApp } from './lib/store';
import { Badge, Btn, Spinner } from './components/ui';
import Dashboard from './core/Dashboard';
import Projects from './core/Projects';
import Providers from './core/Providers';
import Jobs from './core/Jobs';
import WorkflowsPage from './core/Workflows';
import Storage from './core/Storage';
import Exports from './core/Exports';
import Settings from './core/Settings';
import Logs from './core/Logs';
import AssetStudio from './workspaces/AssetStudio';
import PhotoCraft from './workspaces/PhotoCraft';
import FilmCraft from './workspaces/FilmCraft';
import EffectsCraft from './workspaces/EffectsCraft';
import AiCanvas from './workspaces/AiCanvas';
import VideoStudio from './workspaces/VideoStudio';

const NAV: { group: string; items: { key: NavKey; label: string; icon: string; hint?: string }[] }[] = [
  {
    group: 'Workspaces',
    items: [
      { key: 'canvas', label: 'AI Canvas', icon: '⌗', hint: 'Node workflows' },
      { key: 'photocraft', label: 'PhotoCraft', icon: '◨', hint: 'Image creation' },
      { key: 'filmcraft', label: 'FilmCraft', icon: '▤', hint: 'Video creation' },
      { key: 'effectscraft', label: 'EffectsCraft', icon: '✦', hint: 'Effects & enhancement' },
      { key: 'assets', label: 'Asset Studio', icon: '▦', hint: 'Shared library' },
      { key: 'video', label: 'Video Studio', icon: '▣', hint: 'Timeline editing' },
    ],
  },
  {
    group: 'OASIS Core',
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: '◈' },
      { key: 'projects', label: 'Projects', icon: '❒' },
      { key: 'providers', label: 'Providers', icon: '⚡' },
      { key: 'jobs', label: 'Jobs', icon: '◔' },
      { key: 'workflows', label: 'Workflows', icon: '⌗' },
      { key: 'storage', label: 'Storage', icon: '▤' },
      { key: 'exports', label: 'Exports', icon: '⤓' },
      { key: 'settings', label: 'Settings', icon: '⚙' },
      { key: 'logs', label: 'Logs', icon: '≡' },
    ],
  },
];

export const PAGE_TITLES: Record<NavKey, { title: string; subtitle: string }> = {
  dashboard: { title: 'Dashboard', subtitle: 'Project pulse across every workspace' },
  canvas: { title: 'AI Canvas', subtitle: 'Build and run node-based generation workflows' },
  photocraft: { title: 'PhotoCraft', subtitle: 'Generate, edit and enhance images' },
  filmcraft: { title: 'FilmCraft', subtitle: 'Create clips from text or a still frame' },
  effectscraft: { title: 'EffectsCraft', subtitle: 'Upscale, enhance and clean up media' },
  assets: { title: 'Asset Studio', subtitle: 'The shared library every workspace reads and writes' },
  video: { title: 'Video Studio', subtitle: 'Timeline editing, titles and export' },
  projects: { title: 'Projects', subtitle: 'One project context for all workspaces' },
  providers: { title: 'Providers & Models', subtitle: 'fal.ai primary · DeepSeek and Ollama optional' },
  jobs: { title: 'Job Manager', subtitle: 'Every generation and processing job' },
  workflows: { title: 'Workflow Manager', subtitle: 'Saved AI Canvas graphs and run history' },
  storage: { title: 'Storage Manager', subtitle: 'Managed media on disk' },
  exports: { title: 'Export Manager', subtitle: 'Rendered timelines with provenance manifests' },
  settings: { title: 'Preferences', subtitle: 'Application behaviour and diagnostics' },
  logs: { title: 'Logs', subtitle: 'Redacted operational log' },
};

export default function App() {
  const { ready, nav, setNav, project, projects, selectProject, jobs, providers, info, toasts, setNav: go } = useApp();
  const activeJobs = jobs.filter((j) => ['queued', 'submitted', 'running'].includes(j.status)).length;
  const falProvider = providers.find((p) => p.id === 'fal');
  const ffmpegMissing = info && !info.ffmpeg?.available;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const map: Record<string, NavKey> = { '1': 'canvas', '2': 'photocraft', '3': 'filmcraft', '4': 'assets', '5': 'video', '6': 'effectscraft' };
      if (map[e.key]) {
        e.preventDefault();
        go(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  if (!ready) {
    return (
      <div className="center" style={{ height: '100vh' }}>
        <div className="col" style={{ alignItems: 'center' }}>
          <Spinner />
          <span className="muted small">Starting OASIS…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" />
          <div className="brand-text">
            <strong>OASIS</strong>
            <span>creative production</span>
          </div>
        </div>

        {NAV.map((group) => (
          <React.Fragment key={group.group}>
            <div className="nav-group">{group.group}</div>
            {group.items.map((item) => (
              <div key={item.key} className={`nav-item ${nav === item.key ? 'active' : ''}`} onClick={() => setNav(item.key)} title={item.hint}>
                <span className="dot" />
                <span>{item.label}</span>
                {item.key === 'jobs' && activeJobs > 0 ? <span className="badge-count">{activeJobs}</span> : null}
                {item.key === 'providers' && falProvider && !falProvider.hasSecret ? <span className="badge-count">!</span> : null}
              </div>
            ))}
          </React.Fragment>
        ))}

        <div className="sidebar-foot">
          <div className="row">
            <span>v{info?.version || '0.1.0'}</span>
            <span>{info?.ffmpeg?.available ? 'ffmpeg ready' : 'no ffmpeg'}</span>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <div className="title">{PAGE_TITLES[nav].title}</div>
            <div className="subtitle">{PAGE_TITLES[nav].subtitle}</div>
          </div>
          <div className="spacer" />
          {ffmpegMissing ? (
            <Badge tone="warn" title="ffmpeg is required for video generation mocks, exports and local processing">
              ffmpeg missing
            </Badge>
          ) : null}
          {falProvider ? (
            <Badge
              tone={falProvider.hasSecret ? (falProvider.status === 'connected' ? 'ok' : 'info') : 'warn'}
              title={`fal.ai status: ${falProvider.status}`}
            >
              fal {falProvider.hasSecret ? falProvider.status : 'no key'}
            </Badge>
          ) : null}
          {activeJobs > 0 ? (
            <Badge tone="info">
              <Spinner /> {activeJobs} job{activeJobs > 1 ? 's' : ''}
            </Badge>
          ) : null}
          <div className="row" style={{ gap: 6 }}>
            <select className="select" style={{ minWidth: 190 }} value={project?.id || ''} onChange={(e) => selectProject(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <Btn variant="ghost" size="sm" onClick={() => setNav('projects')}>
              Projects
            </Btn>
            <Btn variant="ghost" size="sm" onClick={() => setNav('providers')}>
              Providers
            </Btn>
          </div>
        </header>

        {nav === 'dashboard' ? <Dashboard /> : null}
        {nav === 'canvas' ? <AiCanvas /> : null}
        {nav === 'photocraft' ? <PhotoCraft /> : null}
        {nav === 'filmcraft' ? <FilmCraft /> : null}
        {nav === 'effectscraft' ? <EffectsCraft /> : null}
        {nav === 'assets' ? <AssetStudio /> : null}
        {nav === 'video' ? <VideoStudio /> : null}
        {nav === 'projects' ? <Projects /> : null}
        {nav === 'providers' ? <Providers /> : null}
        {nav === 'jobs' ? <Jobs /> : null}
        {nav === 'workflows' ? <WorkflowsPage /> : null}
        {nav === 'storage' ? <Storage /> : null}
        {nav === 'exports' ? <Exports /> : null}
        {nav === 'settings' ? <Settings /> : null}
        {nav === 'logs' ? <Logs /> : null}
      </div>

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
