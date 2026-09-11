# Tabyrinth

A Chrome side panel extension that turns your tabs into a tree instead of a flat list. Open a link from a tab and it nests under its parent, so you can actually see how you got where you are instead of scrolling through forty identical-looking tabs.

## What it does

- **Tree view of tabs.** Tabs opened from other tabs show up nested underneath them, not just dumped at the end of the tab bar.
- **Closed tabs stick around as ghosts.** Close something by accident (or on purpose) and it stays in the tree, dimmed out, until you click it back open in the same spot.
- **Deep chains collapse into a stack.** If you go down a rabbit hole five links deep, the tree collapses that chain into a little stack you can expand instead of indenting off the screen.
- **Per-tab notes.** Highlight text and right-click to drop a quick note on a tab. Useful for "why did I open this again."
- **Same-page navigation doesn't fork the tree.** SPA route changes and pagination don't spawn a new node — real navigations do, and the old page gets kept as a small history node so you can go back.
- **Tracks whatever's playing any media** so you can jump back to the tab that's making noise without hunting for it.

## How it's built

Manifest V3 extension (WXT), React for the UI, Zustand for state, `chrome.storage.local` as the source of truth. The background script listens to tab lifecycle events (created/updated/removed/activated) and keeps storage in sync; the side panel just reads from it.

The tree itself is just parent/child pointers on each tab node — no separate graph structure, it's rebuilt and sanitized on every write so a bad state can't linger.
