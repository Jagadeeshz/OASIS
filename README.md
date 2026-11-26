# OASIS

One desktop application for AI creative production: node workflows, image and video generation, effects, a shared asset library and a timeline editor with real MP4 export.

Built with Electron 45, React 19, TypeScript, SQLite (wasm) and ffmpeg. Windows installer included.

![status](https://img.shields.io/badge/status-working%20MVP-37c391) ![tests](https://img.shields.io/badge/tests-24%2F24-37c391) ![e2e](https://img.shields.io/badge/desktop%20e2e-8%2F8-37c391)

---

## Quick start

```bash
# from source
npm install
npm run dev            # Vite + Electron with hot reload

# or production-style
npm run build && npm start

# installer (already built)
release\OASIS Setup 0.1.0.exe
```

Requirements: Windows 10/11 x64, **ffmpeg/ffprobe on PATH** for video features, and optionally a fal.ai key for live generation. Without a key everything still runs; results are deterministic placeholders labelled **Mock — unverified**.

## Workspaces

| Workspace | What it does |
|---|---|
| **AI Canvas** | Node graph (`Prompt → Model → Generate → Output` and 13 other node types), validated connections, topological execution, per-node status |
| **PhotoCraft** | Text-to-image, prompt-guided edits, background removal, prompt enhancement |
| **FilmCraft** | Text-to-video and image-to-video with async job tracking |
| **EffectsCraft** | Local upscale/enhance/denoise, fal background removal, before/after, versioning |
| **Asset Studio** | The shared library: previews, provenance, versions, tags, search, import/export, send-to-workspace |
| **Video Studio** | Multi-track timeline, titles, fades, live preview, ffmpeg export with a SHA-256 provenance manifest |
| **OASIS Core** | Projects, providers, jobs, workflows, storage, exports, settings, logs, diagnostics |

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Process model, data model, services, provenance, security boundaries |
| [docs/INSTALLATION.md](docs/INSTALLATION.md) | Prerequisites, installer, silent install, uninstall, packaging, data locations |
| [docs/PROVIDER_SETUP.md](docs/PROVIDER_SETUP.md) | fal.ai key + verified model catalog, DeepSeek, Ollama, execution modes, troubleshooting |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | Workspace-by-workspace guide, mock mode, shortcuts |
| [docs/TESTING.md](docs/TESTING.md) | Test inventory, results, installer test, what is *not* verified |
| [docs/STATUS.md](docs/STATUS.md) | Verified vs planned, limitations, blockers |
| [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md) | Decisions and the conditions that would change them |
| [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) | Workstream record with evidence |

## Verification snapshot

- `npm test` → **24/24 pass** (services, jobs, providers, workflows, export)
- `npx tsc --noEmit` → clean
- `npm run build` → success
- `npm run package` → `release\OASIS Setup 0.1.0.exe`
- Installer → silent install to a clean directory → launched from `app.asar` → **desktop E2E 8/8** → restart preserved project, 3 assets, 2 jobs, 1 export

**Not verified:** any live fal.ai / DeepSeek / Ollama call (no credentials on this machine). See [docs/STATUS.md](docs/STATUS.md) §4 for the exact unblock.

## Security

Provider keys are encrypted with the OS keystore (Electron `safeStorage`/DPAPI), written only by the main process, and never returned to the renderer (masked hint only). The renderer runs sandboxed with context isolation, a strict CSP, and a fixed IPC surface with no filesystem or SQL passthrough. Logs and errors are redacted.

## Licence

Application code: MIT. Third-party: Electron, React, @xyflow/react, sql.js (all permissive) and ffmpeg (LGPL/GPL depending on build — installed separately by the user, not redistributed).
