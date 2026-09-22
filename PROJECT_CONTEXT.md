# Tabyrinth Project Context

Tabyrinth is a browser extension designed for advanced tab management, allowing users to organize tabs into hierarchical structures (trees), group them into workspaces, and attach detailed notes to individual tabs.

## 核心 Architecture & Data Model

### Data Structures (`src/types/index.ts`)
- **TabNode**: The primary unit. Represents a tab with metadata (title, URL, windowID) and relationship data (`parentID`, `childrenIDs`). It supports a list of `TabNote` objects.
- **TabGroup**: Defines how tabs are clustered.
  - `GroupType`: Either `'chain'` (hierarchical/sequential) or `'ghost'` (standalone grouping).
- **Workspace**: A high-level organizational container with a name and optional color.
- **TreeStorageSchema**: The global state object including all nodes, root IDs, group definitions, workspace configurations, and subscription status (`isPro`).

### State Management (`src/store/useTreeStore.ts`)
The project uses a centralized store (likely Zustand, based on the `useTreeStore` naming convention) to manage the tab tree, workspace switching, and ghost group logic.

## Key Features & Implementation

### 1. Tab Hierarchy & Grouping
- Supports recursive tab structures where tabs can have children.
- **Workspaces**: Users can isolate sets of tabs into different workspaces.
- **Ghost Groups**: Special groupings that allow tabs to be clustered without necessarily following a strict parent-child hierarchy.

### 2. Note-Taking System
- Users can attach multiple notes to any tab.
- **Sanitization**: HTML content in notes is sanitized via `src/utils/sanitizeHTML.ts` using an allow-list of tags (including `SUP` for citations).
- **Export**: Notes can be exported to Markdown using `src/utils/exportNotes.ts`, powered by `Turndown`.

### 3. Synchronization & Storage
- **Local Storage**: Handled via `src/services/storage.ts`.
- **Cloud Sync**: Implemented in `src/services/sync.ts` for Tabyrinth Plus users, handling the synchronization of the `SyncPayload` across devices.

### 4. UI/UX (`entrypoints/sidepanel/`)
- The primary interface is a sidepanel (`App.tsx`) displaying the tab tree.
- Includes specialized components like `TreeNode` for the hierarchy and `MediaCard` for rich media content.
- Uses Tailwind CSS for styling.

## Development Notes for AI
- **Markdown Export Pipeline**: HTML $\rightarrow$ `sanitizeHTML` $\rightarrow$ `Turndown` $\rightarrow$ Post-processing (bracket cleanup).
- **Extension Framework**: Built using **WXT**, which handles the browser extension manifest and entry points.
- **Naming Conventions**: Uses `TabNode` for the tree elements and `Workspace` for the top-level categories.
