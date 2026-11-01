# Tabyrinth Extension Test Report

Date: 2026-10-29  
Build: `1.0.0`  
License: Plus key supplied by the requester (not recorded here)

## Executive summary

The extension type-checks, produces a Chrome MV3 package successfully, and has now been exercised in a real Playwright-launched Chromium instance with the unpacked extension loaded. The harness verified the side-panel UI, real Chrome tab creation, search input, settings, license activation/persistence, workspace creation, moodboard expansion, storage access, and runtime errors.

The earlier direct `http://localhost`/`file://` load was invalid for extension acceptance testing because it lacked Chrome extension APIs. The new harness corrected that by launching Chromium with the unpacked extension and opening `chrome-extension://<id>/sidepanel.html`.

## Test metadata

| Field | Value |
|---|---|
| Test date | 2026-10-29 |
| Product build | `1.0.0` |
| Browser | Playwright-managed Chromium 156 |
| Extension mode | Unpacked Chrome MV3 build from `.output\chrome-mv3` |
| Browser profiles | Disposable Profile A and Profile B; normal user profile was not used |
| License handling | Supplied Plus key passed through an environment variable only; never written to source, reports, or screenshots |
| Harness | [extension-harness.ts](./extension-harness.ts) |
| Raw machine result | [HARNESS_RESULTS.json](./HARNESS_RESULTS.json) |
| Overall result | PASS for exercised local features and exports; PARTIAL for cross-profile sync |

## Detailed test matrix

| ID | Test | Preconditions / fixture | Expected result | Actual result | Status | Evidence / follow-up |
|---|---|---|---|---|---|---|
| WS-01 | Create workspace | Plus-enabled panel | New workspace is created and becomes active | `Harness Workspace` was created and selected | PASS | Harness output; add rename/move fixture next |
| WS-02 | Switch workspace with many tabs | Three synthetic tabs in each of two workspaces | Active workspace shows only its own tabs | Beta tabs appeared; default tabs were hidden | PASS | `workspace-beta-note.png` |
| NT-01 | Render notes in workspace A | Seeded note on `Alpha research 1` | Note count/overlay/content visible | Note overlay rendered and screenshot captured | PASS | `workspace-default-note.png` |
| NT-02 | Render notes in workspace B | Seeded note on `Beta research 1` | Note stays attached to beta tab | Note rendered after switching to beta workspace | PASS | `workspace-beta-note.png` |
| NT-03 | Separate notes between workspaces | Notes on tabs in both workspaces | Switching workspace must not mix notes | Notes remained associated with their respective tabs | PASS | Add live context-menu capture fixture next |
| MB-01 | Open moodboard | Seeded image and note items | Board expands without runtime errors | Board expanded successfully | PASS | `moodboard.png` |
| MB-02 | Render image and text items | Image URL plus note item | Both item types appear in board | Seeded text rendered; image item was stored/rendered by board fixture | PASS | `moodboard.png` |
| EX-01 | Notes Markdown, workspace | Notes in active workspace | Download `.md` containing workspace notes | Download completed | PASS | `tabyrinth-notes-untitled-*.md` |
| EX-02 | Notes Markdown, all | Notes in multiple workspaces | Download `.md` containing all notes | Download completed | PASS | `tabyrinth-notes-all-*.md` |
| EX-03 | Notes PDF, workspace/all | Notes fixture | Printable export tab opens | Both variants opened printable tabs | PASS | Harness page-count assertions |
| EX-04 | Moodboard Markdown, workspace/all | Image and note items | Download `.md` for selected scope | Both variants downloaded | PASS | `tabyrinth-moodboard-*.md` |
| EX-05 | Moodboard PDF, workspace/all | Image and note items | Printable export tab opens | Both variants opened printable tabs | PASS | Harness page-count assertions |
| EX-06 | Visual moodboard PDF | Masonry board fixture | Printable visual export tab opens | Opened after targeting the actual PDF button | PASS | Harness output |
| EX-07 | Visual moodboard HTML | Masonry board fixture | Download `.html` | Download completed | PASS | `tabyrinth-visual-moodboard-*.html` |
| EX-08 | Research trail, workspace/all | Nested/tree fixture | Download `.md` trail | Both variants downloaded | PASS | `tabyrinth-trail-*.md` |
| SY-01 | Profile A to B sync | Two licensed profiles; wait for flush | Profile B receives Profile A state | Profile B received Profile A tabs | PASS | `cross-browser-profile-b.png` |
| SY-02 | Profile B to A sync | Add tab in B; wait; restart A | Profile A receives B change | Profile A did not receive `Profile B only tab` | FAIL | High-priority sync investigation |
| QA-01 | Runtime errors | Full second-wave flow | No console/page errors | No console/page errors reported | PASS | `HARNESS_RESULTS.json` |

## Checks performed

| Area | Result | Evidence |
|---|---|---|
| TypeScript compilation | PASS | `npm run compile` exited 0 |
| Chrome production build | PASS | `npm run build` exited 0; generated `.output/chrome-mv3` |
| WXT development build | PASS | WXT generated the dev package and opened Chromium |
| Initial side-panel rendering in Chromium | PASS | Screenshot matched the supplied layout: dark panel on the right, Tabyrinth header, Untitled workspace, active count, current tab, New tab, search, reset, settings |
| Standalone `sidepanel.html` load | NOT APPLICABLE | Blank/error page when opened as `http://localhost` or `file://`; Chrome extension APIs are absent in those contexts |
| License activation and persistence | PASS | Real key supplied at runtime only; Plus state persisted across panel reload |
| Tab creation | PASS | New tab action increased the real Chromium page count |
| Tab nesting/tree behavior | NOT EXECUTED | Requires a multi-page opener/navigation fixture |
| Ghost-tab recovery | NOT EXECUTED IN the exposed page | Requires Chrome tab lifecycle events |
| Search input | PASS | Search query accepted in the live side panel |
| Search filters | NOT EXECUTED | Requires dedicated closed-tab and mode fixtures |
| Notes/context-menu capture | NOT EXECUTED IN the exposed page | Requires context menus, scripting, and selection |
| Workspace creation | PASS | Created and switched to a workspace through the UI |
| Ghost groups/cloud group | NOT EXECUTED | Requires dedicated tab/storage fixtures |
| Media tracking | NOT EXECUTED IN the exposed page | Requires audible Chrome tabs |
| Citation capture/export | NOT EXECUTED IN the exposed page | Requires context-menu injection and clipboard/download permissions |
| Moodboard toggle | PASS | Board expanded in the live side-panel layout |
| Moodboard pinning/export | NOT EXECUTED | Requires context-menu events and download APIs |
| Hot Tabs | NOT EXECUTED | Requires dedicated Plus-state tab-set fixture |
| Console/page runtime errors | PASS | No console or page errors during the harness flow |

## Playwright harness run

The harness is [extension-harness.ts](./extension-harness.ts). It uses a fresh temporary profile at `testing\chromium-profile`, loads `.output\chrome-mv3` as an unpacked extension, and closes Chromium when finished.

```powershell
npm run build
$env:TABYRINTH_LICENSE_KEY='(supplied at runtime only)'
npx tsx testing\extension-harness.ts
```

The first-wave smoke run result was **PASS**. The second-wave run is **PARTIAL** because of `SY-02`; machine-readable results are in [HARNESS_RESULTS.json](./HARNESS_RESULTS.json). The license value is intentionally omitted from both files.

## Findings

### 1. Firefox lint is not a valid gate for this Chrome-only extension

`npx web-ext lint --source-dir .output\chrome-mv3 --no-input` reported two errors and several warnings. The errors are expected for the current target:

- Firefox requires a background scripts fallback for the generated service-worker manifest.
- Firefox requires an add-on ID.

The warnings also identify Chrome-only APIs/permissions (`sidePanel`, `favicon`) and Firefox metadata. This should not block Chrome packaging, but a Firefox build should be linted separately with the Firefox WXT target and a Firefox-compatible manifest.

### 2. Standalone side-panel HTML is not a supported launch mode

Opening the generated page directly results in missing `chrome.*` APIs and a blank UI. The harness now loads it correctly as `chrome-extension://<id>/sidepanel.html`.

### 3. Static sanitizer review

Notes are rendered through `sanitizeHTML` before being assigned to React's `dangerouslySetInnerHTML`. The sanitizer removes scripts/styles/images and only preserves an allow-list of tags. Links are restricted to values beginning with `http` or `/`. This path should still receive a live paste/context-menu test with script/event-handler payloads; that test could not be completed without the extension context.

## Recommended next run

Extend the harness with dedicated fixtures for:

1. Opener-based tab nesting and same-page navigation.
2. Ghost close/restore behavior.
3. Workspace moving and rename persistence.
4. Plain text, HTML, and code notes with script/event-handler payloads.
5. Search modes and closed-tab filters.
6. Media tracking and focus.
7. Citation capture/edit/copy/download.
8. Moodboard pinning/linking and all exports.
9. Hot Tabs creation, launch, and deletion.

## Overall status

**Build/package health: PASS. Core and export smoke tests: PASS.** Cross-browser sync is **PARTIAL**: Profile A -> B passed, while Profile B -> A failed in the final bidirectional test. The remaining features above require additional fixtures and longer interaction flows; they were not falsely marked as passing.

## Second-wave results

The expanded Playwright run exercised the requested scenarios using two fresh Chromium profiles and synthetic tab/content fixtures:

| Area | Result | Details |
|---|---|---|
| Multiple workspaces and switching | PASS | Created/switches between default and Harness Workspace; three tabs per workspace were isolated correctly |
| Notes in separate workspaces | PASS | Notes rendered in each workspace, stayed attached to the correct tab, and screenshots were captured |
| Moodboard text/image content | PASS | Seeded image and note items rendered; moodboard screenshot captured |
| Notes Markdown exports | PASS | Workspace and all-workspaces downloads completed |
| Notes PDF exports | PASS | Workspace and all-workspaces printable tabs opened |
| Moodboard Markdown exports | PASS | Workspace and all-workspaces downloads completed |
| Moodboard PDF exports | PASS | Workspace and all-workspaces printable tabs opened |
| Visual moodboard PDF | PASS | Printable tab opened after correcting the selector to target the actual button |
| Visual moodboard HTML | PASS | HTML download completed |
| Research trail exports | PASS | Workspace and all-workspaces downloads completed |
| Cross-browser sync, Profile A -> B | PASS | Profile B received Profile A's tab state after the sync flush window |
| Cross-browser sync, Profile B -> A | FAIL | Profile A did not receive a tab added by Profile B after the reverse sync/restart check |
| Runtime errors | PASS | No console/page errors during the final run |

Screenshots are stored under [testing/screenshots](./screenshots):

- `workspace-beta-note.png`
- `workspace-default-note.png`
- `moodboard.png`
- `cross-browser-profile-b.png`

The reverse-sync failure is the main product finding from this wave. The one-way path works, but the reverse direction did not become visible in the restarted Profile A session after the sync flush interval. The raw result is in [HARNESS_RESULTS.json](./HARNESS_RESULTS.json).

## Fix backlog

| Priority | Finding | Reproduction | Likely investigation area | Acceptance criteria |
|---|---|---|---|---|
| High | Reverse cross-browser sync does not apply Profile B changes to Profile A | Run `SY-01`, add `Profile B only tab` in B, wait for the flush window, close/reopen A, then inspect `tabTreeData` | Push/pull timing, `lastSyncedAt`, server conflict merge, and startup `initializeSync()` ordering in `src/services/sync.ts` | A change created in either licensed profile appears in the other after sync/restart; both directions pass repeatedly |
| Medium | Live note capture was not covered in this automated wave | Use the context menu on a real page selection in each workspace | Background context-menu injection and `StorageService.addNoteToTab` | Plain text, HTML, and code selections render safely and persist to the correct tab |
| Medium | Citation capture/export was not covered in this automated wave | Use a page with citation meta tags and invoke the context menu | `captureSourceInPage`, citation panel, clipboard/download permissions | APA, IEEE, and BibTeX outputs match captured metadata |
| Medium | Ghost/media/Hot Tabs paths remain unverified | Generate closed tabs, audible media, and a Plus hot-tab set | Background tab lifecycle listeners and Plus-only guards | Each feature passes after reload and storage inspection |

## Limitations and interpretation

- The tests used synthetic tab records for workspace/note/moodboard coverage. They validate UI/state rendering, but not every browser lifecycle event.
- PDF actions open printable HTML tabs; the harness verifies tab creation, not OS-level printer output.
- The screenshots are visual evidence for layout/content presence, not pixel-perfect approval baselines.
- A PASS means the stated assertion passed; it does not imply untested adjacent behavior passed.
