# Sync Verification and Feature Gating Plan
# #todo 30-09-2026
This document outlines the strategy for ensuring that "Plus" features (Sync, Groups, Hot Tabs, and Exporting) are correctly gated behind the payment verification system and provides a detailed test plan for a fresh sync state.

## 1. Current Payment Verification Analysis

Based on `src/services/sync.ts`, the current verification flow is:
1. **License Activation**: `activateLicenseKey(rawKey)` calls `/api/verify-key`. On success, it sets `isPro: true` and stores the `licenseKey` in `chrome.storage.local`.
2. **Sync Gating**:
    - `pushSync` and `pullSync` both call `getLicenseKey()`. If no key exists, they fail immediately.
    - `flushPendingSync` and `initializeSync` check the `isPro` flag from the local storage state.
3. **Server-Side Gating**: The Worker validates the `Authorization: Bearer <licenseKey>` header on every request. If the key is invalid, it returns `401` or `403`, and the extension subsequently sets `isPro: false`.

## 2. Feature Gating Direction (The "Plus" Model)

To extend this to other features, we should adopt a consistent "Pro Guard" pattern.

### A. Sync (Existing)
- **Status**: Already gated.
- **Mechanism**: License key required for API calls + `isPro` flag for local logic.

### B. Groups & Hot Tabs
- **Requirement**: These should be read-only or disabled for non-Pro users.
- **Direction**:
    - **UI Layer**: Wrap the Group/HotTab management UI components in a check: `if (!isPro) showUpgradePrompt()`.
    - **Logic Layer**: In the store actions (e.g., `createGroup`, `addHotTab`), add a guard: `if (!state.isPro) throw new Error("Upgrade to Pro to use this feature")`.

### C. Exporting (Moodboards, Notes, etc.)
- **Requirement**: Exporting functionality must be a paid feature.
- **Direction**:
    - **Entry Point**: Identify all "Export" buttons in the UI.
    - **Guard**: Before executing the export logic, check `isPro`. If false, trigger the payment/upgrade modal.

## 3. Fresh Sync Test Plan

To verify the sync works flawlessly from a clean state, follow these steps:

### Phase 1: Environment Reset
1. **Clear Worker Data**: 
    - Access the Cloudflare Worker KV/D1 dashboard.
    - Delete all user records associated with the test `deviceId` or `licenseKey`.
2. **Clear Local Extension Data**:
    - Open Chrome DevTools for the extension.
    - Run: `await chrome.storage.local.clear();`
    - Restart the extension.

### Phase 2: First-Time Activation (Client A)
1. **Activate**: Enter a valid license key.
2. **Verify**: Ensure `isPro` becomes `true` in local storage.
3. **Populate**: Create several nodes, a few groups, some moodboard items, and a hot tab set.
4. **Trigger Sync**: Wait for the debounce or trigger a window focus change to force `flushPendingSync`.
5. **Verify Worker**: Check the Worker logs to ensure a `POST /api/sync` was successful.

### Phase 3: Cross-Device Sync (Client B)
1. **Activation**: On a second browser profile/device, activate with the same license key.
2. **Initial Pull**: Upon `initializeSync`, verify that all data from Client A is pulled and merged into Client B's local storage.
3. **Modification**: Change a node title or add a group on Client B.
4. **Push/Pull Cycle**: Verify the change propagates back to Client A.

### Phase 4: Edge Case Testing
- **Invalid Key**: Try syncing with an expired/fake key $\rightarrow$ verify `isPro` is set to `false` and sync stops.
- **Network Offline**: Modify data while offline $\rightarrow$ verify it syncs immediately upon returning online.
- **Conflict**: Modify the same node on both clients simultaneously $\rightarrow$ verify the `updatedAt` timestamp logic handles the winner correctly.

---

## 4. Post-Sync Implementation Roadmap

Once the sync testing is verified as "Flawless", we will move to the implementation of the "Pro Guard" gating.

### Step 1: Logic Gating (Backend/Store)
- [ ] **Guard Group Creation**: Update `src/store/useTreeStore.ts` (or relevant service) to block group creation/editing if `!isPro`.
- [ ] **Guard HotTabs**: Block adding/removing items from HotTab sets if `!isPro`.
- [ ] **Guard Exports**: Update all moodboard and note export functions to verify `isPro` before processing.

### Step 2: UI Gating (Frontend)
- [ ] **Lock Indicators**: Add visual cues (lock icons) to paid features in the sidepanel.
- [ ] **Upgrade Modals**: Implement a unified `UpgradePrompt` component that triggers when a non-pro user attempts to use a gated feature.
- [ ] **Paywall Integration**: Ensure the prompt links correctly to the checkout session creation logic in `src/services/sync.ts`.

### Step 3: Final Verification
- [ ] **Non-Pro Audit**: Verify that a user without a license key cannot sync, create groups, manage hot tabs, or export data.
- [ ] **Pro Audit**: Verify that all "Plus" features are fully available after successful license activation.
