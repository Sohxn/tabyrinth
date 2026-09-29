# Codebase Cleanup Plan

The audit revealed a pattern of **leaky logic** (UI components doing heavy lifting) and **scattered duplication**.

## 1. The "Leaky Logic" (UI doing too much)
*   **Chrome API Spam**: `TreeNode.tsx` and `MediaCard.tsx` are calling `chrome.tabs` and `chrome.windows` directly. This should be handled by a service or the store.
*   **Heavy Lifting in `App.tsx`**: The logic to create "Hot Tabs" (querying, filtering, mapping) is sitting right in the UI component.
*   **Inline Sanitization**: `Board.tsx` and `TreeNode.tsx` are sanitizing HTML inside the render loop.
*   **Filenames**: `App.tsx` is manually building export filenames with timestamps and regex.

## 2. Actual Duplication
*   **Chain Logic**: The code to calculate chain length is written twice: once in `useTreeStore.ts` and once in `TreeNode.tsx`.
*   **Selection Scripts**: The `executeScript` block for capturing DOM selections is duplicated in `background.ts`.
*   **URL Filtering**: The regex to ignore `chrome://` or `edge://` URLs is repeated in `App.tsx` and `background.ts`.

## 3. Constant Clashes
*   **Chain Threshold**: `CHAIN_FOLD_THRESHOLD` (store) and `CHAIN_THRESHOLD` (UI) both equal `4`.

---

## Atonement Plan

### Phase 1: The Utility Layer (`src/utils`)
- Create `treeUtils.ts` (Chain length logic).
- Create `urlUtils.ts` (Internal URL filtering).
- Create `fileUtils.ts` (Filename generation).

### Phase 2: The Service/Store Layer
- Move all `chrome.tabs/windows` calls into `useTreeStore` or a new `BrowserService`.
- Move the "Hot Tab" generation logic out of `App.tsx` and into the store.
- Move the active tab counting logic into a store selector.

### Phase 3: Component Lean-out
- Update `TreeNode`, `MediaCard`, and `App` to use the new utilities and store methods.
- Centralize the `CHAIN_THRESHOLD` constant.
