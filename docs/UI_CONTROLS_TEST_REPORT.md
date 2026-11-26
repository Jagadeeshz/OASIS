# OASIS — control test report

Run: `node scripts/controls-test.mjs` against the running desktop build (CDP 9333, window 1500×940). Raw output: `docs/evidence/controls-report.json`.

**Result: 24 / 24 checks passed, 0 failed.**

| Page | Control | Expected behaviour | Actual result | Status |
|---|---|---|---|---|
| AI Canvas | Canvas loads starter graph | 4 nodes rendered | 4 nodes | Pass |
| AI Canvas | Save as | Opens a name dialog | Dialog opened | Pass |
| AI Canvas | Add node + Undo | Node count +1, then back | 4→5→4 | Pass |
| AI Canvas | Redo | Restores the added node | 5 nodes | Pass |
| AI Canvas | Zoom in | Viewport scale changes | Scale changed | Pass |
| AI Canvas | Palette search | Filters node list | 2 items for "video" | Pass |
| AI Canvas | Clear canvas | Requires confirmation | Confirmation shown | Pass |
| Asset Studio | Multi-select + Compare | Enabled with two selected | 17 cards, Compare enabled | Pass |
| Asset Studio | Compare dialog | Side-by-side previews | Opened | Pass |
| Asset Studio | List view | Renders a table | 17 rows | Pass |
| Asset Studio | Favourites filter | Filters the grid | Filter toggled | Pass |
| Job Manager | Search | Filters the table | 16 → 0 rows for a non-matching query | Pass |
| Job Manager | Provider filter | Filter select renders | Present | Pass |
| Workflow Manager | Search | Search input renders | Present | Pass |
| Workflow Manager | Rename | Opens a dialog | Dialog opened | Pass |
| Workflow Manager | Duplicate | Control present | Present | Pass |
| Export Manager | Search | Search input renders | Present | Pass |
| Export Manager | Retry / remove controls | Present on rows | `{retry:false, remove:true}` (no failed export in this dataset) | Pass |
| PhotoCraft | Clear settings | Button present | Present | Pass |
| PhotoCraft | Download result | Shown with a result | Not shown — no result in view at that moment | Pass (conditional by design) |
| PhotoCraft | Clear settings resets prompt | Textarea empty | Cleared | Pass |
| Video Studio | Add video track | Track count +1 | 3 → 4 | Pass |
| Video Studio | Mute track | Toggles to unmute state | `Unmute track` | Pass |
| Video Studio | Duplicate clip | Disabled without a selection | Disabled (no clip selected) | Pass |

---

## Regression suite run alongside

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -p tsconfig.json --noEmit` | clean |
| Unit/integration tests | `npm test` | 24 / 24 pass |
| Production build | `npm run build` | success |
| Desktop E2E (8 steps) | `node scripts/e2e.mjs` | 8 / 8 pass (run earlier in this session on this build line) |
| Theme audit | `node scripts/ui-tour.mjs` | 15 screens, no console errors (`docs/evidence/theme-audit.txt`) |

## Controls present but not exercised by the automated run

These were verified by reading the implementation and by the behaviour of the surrounding flow; they are **not** claimed as machine-tested:

| Page | Control | Why not automated |
|---|---|---|
| AI Canvas | Stop execution | Needs a long-running live job; the run id is only live during a real provider call |
| AI Canvas | Edge select + Delete | React Flow edge hit-testing is pointer-based; covered by code path only |
| Asset Studio | Bulk favourite / archive, drawer favourite | Multi-step state + async refresh; verified by code and manual click-through |
| Asset Studio | Drag-and-drop import | Requires OS-level drag events |
| Job Manager | Cancel / Retry | Requires a job in a cancellable/failed state at test time |
| Workflow Manager | Run | Produces assets and spends time; covered by the canvas E2E instead |
| Export Manager | Retry | No failed export existed in the dataset at run time |
| Video Studio | Lock track, Split clip, Duplicate with a selection | Pointer-driven; code paths verified |
| Video Studio | Export with muted track | Exporter honours `muted`; unit suite does not yet cover it |
| Providers | Test connection with a live key | The configured fal account is blocked by billing (`403 — Exhausted balance`) |
| Settings | Diagnostics run | Exercised in the earlier installed-build audit |

## Known failures and limitations at report time

1. **fal.ai live generation** — blocked at the provider (account balance), not by the app. Failures are recorded as failed jobs; nothing is shown as verified.
2. **PhotoCraft download** correctly does not appear until a result exists; the check passes as a conditional, not as an exercised download.
3. **Export retry** could not be exercised because the dataset contained no failed export; the button appears only in that state by design.
4. Automated coverage is DOM/state-level. Pointer gestures (drag, trim, split, edge deletion) and native dialogs (save-copy, folder open) remain manual.
