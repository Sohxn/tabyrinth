# Sync Bug Analysis

## 🚩 The Issue
When activating a license in a new browser session, the account is successfully activated, but existing tabs/data are not fetched from the server. The app starts with a fresh state instead of pulling synced data.

## 🔍 Root Cause Analysis

### 1. The Activation Gap
In `src/services/sync.ts`, the `activateLicenseKey` function handles the API call to `/api/verify-key` and sets the `isPro` flag in local storage. However, it **does not** trigger a data fetch.

**Current Logic Flow:**
1. Browser starts $\rightarrow$ `initializeSync()` is called.
2. `initializeSync()` checks `if (!state.isPro) return;` $\rightarrow$ **Exits** (because user isn't activated yet).
3. User activates license $\rightarrow$ `activateLicenseKey()` sets `isPro: true`.
4. **Gap:** The app is now Pro, but `initializeSync()` is not called again.

### 2. Worker Log Evidence
The absence of `/api/sync` logs in the worker, while `/api/verify-key` logs are present, confirms that the client is successfully authenticating but **never requesting the data pull**.

## 🛠️ Proposed Fix

Modify `activateLicenseKey` in `src/services/sync.ts` to invoke `initializeSync()` immediately after a successful activation.

**Code Change:**
```typescript
// src/services/sync.ts -> activateLicenseKey()

await chrome.storage.local.set({
    licenseKey: rawKey.trim(),
    isPro: true
});

// Trigger immediate pull of synced data
await initializeSync(); 
```

## 📊 Summary
- **Pull Failure:** Triggering issue. The request is never sent to the server after activation.
- **Push Failure:** Secondary. Since the initial pull never happened, the local state remains empty; no "dirty" changes are detected to trigger a push.
- **Worker Status:** Healthy. It is simply not receiving the requests.
