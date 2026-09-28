# Future Features Roadmap

## LOW PRIORITY LATER
- **Comparison Engine**: A system to orchestrate side-by-side analysis of multiple tabs from a workspace. Should allow tiling of browser windows/tabs and anchoring of specific content sections across different pages for direct comparison.

## HIGH PRIORITY TO DESIGN NOW
- **Hot tabs**: A system which solves the issue of people opening the same set of tabs in the same sequence everyday.
* what we would have is: a section that has a set of "starters": folders with a set of tabs that open on clicking the starter launcher: for example
* jira tickets: certain page + github.com/soxhn/ + microsoft teams meeting opens together on three tabs instantly on clicking the starter
* saving time and effort

### 🛠 Detailed Technical Implementation Plan: Hot Tabs (Starters)

#### 1. Data Model & Persistence
**File: `src/types/index.ts`**
- Define `HotTabItem`: `{ url: string; title: string; }`
- Define `HotTabSet`: `{ id: string; name: string; items: HotTabItem[]; createdAt: number; }`
- Update `TreeStorageSchema`: Add `hotTabs?: Record<string, HotTabSet>;`

**File: `src/services/storage.ts`**
- Implement `saveHotTabSet(set: HotTabSet)`: Use `this.transaction` to merge the new set into the `hotTabs` record.
- Implement `deleteHotTabSet(setId: string)`: Use `this.transaction` to remove the ID from the `hotTabs` record.
- Implement `getHotTabSets()`: Return `Object.values(state.hotTabs || {})`.

#### 2. State Management
**File: `src/store/useTreeStore.ts`**
- **State**: Add `hotTabs: Record<string, HotTabSet>;`
- **Action `initHotTabs`**: Fetch `hotTabs` from `StorageService` and update state.
- **Action `launchHotTabSet(setId: string)`**:
    - Retrieve set from state.
    - Open first tab via `chrome.tabs.create`.
    - Capture the resulting `windowId`.
    - Loop through remaining URLs and open them in the same `windowId` to keep the group intact.

#### 3. UI Integration
**File: `entrypoints/sidepanel/App.tsx`**
- **Trigger**:
    - Add `LightningIcon` from `@phosphor-icons/react` to the footer grid.
    - Add state `const [isStarterPaneOpen, setIsStarterPaneOpen] = useState(false);`.
- **Pane Implementation**:
    - Create `StarterPane` overlay: `absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col p-4 overflow-y-auto`.
    - **Header**: Title "Hot Tabs" and a close button (✕).
    - **List**: Map through `hotTabs` state. Each item: `bg-white/10 rounded-2xl p-4` containing Name, "Launch" button (Primary color), and "Delete" button (Ghost color).
    - **Creation**: Add a dashed-border button `+ Create from Current Workspace` to automatically capture currently open tabs.

#### 4. Project Idiom & Patterns
- **Async Flow**: All UI handlers in `App.tsx` must follow the pattern: `async () => { const schema = await StorageService.get(); ... }`.
- **Storage Integrity**: All writes must use `StorageService.transaction` to ensure state consistency.
- **Visual Style**: Use `bg-white/10 rounded-2xl p-4` containers to match the existing Settings pane design.
- **Human Feel**: Implement clean `try/catch` blocks around browser API calls and use descriptive variable names.

---
so lets start now.
All i need from you are the code changes and ill type them out in my editor

Make no mistakes.
Make sure the code is error and bug free and follows good clean software design principles and follows the overall design and coding pattern
that I have followed in my project. The code should also look human.
