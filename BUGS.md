# Known Bugs & Issues

## Critical
- **App Crash (White Screen)**: `App.tsx` attempts to import `exportMoodboardToPDF` from `@/src/utils/exportPDF`, but the function is not exported from that file. This causes a module resolution failure at runtime, preventing the React app from mounting.

## Technical Debt / Architecture
- **Redundant Export Logic**: Moodboard PDF exports are fragmented. `exportVisualMoodboardToPDF` hardcodes its own HTML wrapper instead of using the unified `wrapHtmlDocument` utility found in `exportPDF.ts`.
- **Missing Implementation**: `exportMoodboardToPDF` logic (Markdown-style PDF) is called by the UI but not implemented in the utility layer.
- **Circular/Messy Dependency**: `exportPDF.ts` needs `buildMoodboardExport` from `exportMoodboard.ts`, and `exportMoodboard.ts` needs `downloadMarkdown` from `exportNotes.ts`. While not a circular loop yet, the logic is scattered.
