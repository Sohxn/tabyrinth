import { StorageService } from "./storage";
import { type SyncPayload, type TreeStorageSchema } from "../types";
import { URLs } from "../requestURLs/urls";

const WURL = URLs['prod'];

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;
let isDirty = false;
let lastPushedHash = "";

const DEBOUNCE_DELAY = 3000;
const MAX_WAIT_DELAY = 15000;


//todo: replace with a cryptographic hash 
function fastHash(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(36);
}

export async function getDeviceID(): Promise<string> {
    const result = await chrome.storage.local.get("deviceId");
    if (typeof result.deviceId === "string") {
        return result.deviceId;
    }
    const newDeviceID = crypto.randomUUID();
    await chrome.storage.local.set({
        deviceId: newDeviceID
    });

    return newDeviceID;
}

export async function getLicenseKey(): Promise<string | null> {
    const result = await chrome.storage.local.get("licenseKey");
    return typeof result.licenseKey === "string" ? result.licenseKey : null;
}

export async function activateLicenseKey(rawKey: string): Promise<{ success: boolean; error?: string }> {
    try {
        const deviceID = await getDeviceID();
        const response = await fetch(`${WURL}/api/verify-key`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${rawKey.trim()}`,
                "X-Device-ID": deviceID,
            }
        });

        const data = await response.json();
        if (!response.ok) {
            return {
                success: false,
                error: data.error
            };
        }

        await chrome.storage.local.set({
            licenseKey: rawKey.trim(),
            isPro: true
        });

        return {
            success: true
        }
    } catch (err: any) {
        return {
            success: false,
            error: err.message
        }
    }
}

export async function pushSync(payload: SyncPayload): Promise<{ success: boolean; locked?: boolean }> {
    const lk = await getLicenseKey();
    if (!lk) return { success: false };

    try {
        const deviceID = await getDeviceID();
        const response = await fetch(`${WURL}/api/sync`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${lk}`,
                "X-Device-ID": deviceID,
            },
            body: JSON.stringify(payload),
        });

        if (response.status === 429) {
            console.warn("Sync temporarily locked: Another active session in progress.");

            return { success: false, locked: true };
        }

        if (response.status === 403 || response.status === 401) {
            await chrome.storage.local.set({ isPro: false, licenseKey: null });
            return { success: false };
        }

        return { success: response.ok };
    } catch (err) {
        console.error("push failed: ", err);
        return { success: false };
    }
}

export async function pullSync(): Promise<{ data: SyncPayload | null; locked?: boolean }> {
    const lk = await getLicenseKey();
    if (!lk) return { data: null };

    try {
        const deviceID = await getDeviceID();
        const response = await fetch(`${WURL}/api/sync`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${lk}`,
                "X-Device-ID": deviceID,
            },
        });

        if (response.status === 429) {
            console.warn("Sync temporarily locked: Another active session in progress.");
            return { data: null, locked: true };
        }

        if (response.status === 403 || response.status === 401) {
            await chrome.storage.local.set({ isPro: false, licenseKey: null });
            return { data: null };
        }

        if (!response.ok) return { data: null };
        const result = await response.json();
        return { data: result.data || null };
    } catch (err) {
        console.error("pull failed: ", err);
        return { data: null };
    }
}

export async function createCheckoutSession(email: string): Promise<string> {
    const result = await fetch(`${WURL}/api/create-payment-link`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email }),
    });

    const data = await result.json();
    if (!result.ok) {
        throw new Error(data.error || "Failed to initiate payment");
    }
    return data.paymentUrl;
}

// only push if system is dirty and state has changed
export async function flushPendingSync(): Promise<void> {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }

    if (!isDirty) return;

    const state = await StorageService.get();
    const { isPro, workspaces, activeWorkspaceID, nodes, rootIDs } = state;

    if (!isPro || !Array.isArray(workspaces)) {
        isDirty = false;
        return;
    }

    const contentStr = JSON.stringify({ workspaces, activeWorkspaceID, nodes, rootIDs });
    const currHash = fastHash(contentStr);

    if (currHash === lastPushedHash) {
        isDirty = false;
        return;
    }

    const payload: SyncPayload = {
        updatedAt: Date.now(),
        workspaces,
        activeWorkspaceID: activeWorkspaceID ?? "",
        nodes: nodes ?? {},
        rootIDs: rootIDs ?? [],
    };

    const result = await pushSync(payload);
    if (result.success) {
        lastPushedHash = currHash;
        isDirty = false;
        await StorageService.set({ lastSyncedAt: payload.updatedAt });
    }
}

export function triggerDebouncedPush(): void {
    isDirty = true;

    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
        flushPendingSync();
    }, DEBOUNCE_DELAY);

    if (!maxWaitTimer) {
        maxWaitTimer = setTimeout(() => {
            flushPendingSync();
        }, MAX_WAIT_DELAY);
    }
}

// sync life cycle
export async function initializeSync(): Promise<void> {
    const state = await StorageService.get();
    if (!state.isPro) return;

    const { data: remotePayload, locked } = await pullSync();
    if (locked || !remotePayload) return;

    const localUpdatedAt = state.lastSyncedAt ?? 0;

    if (remotePayload.updatedAt > localUpdatedAt) {
        await StorageService.set({
            workspaces: remotePayload.workspaces,
            activeWorkspaceID: remotePayload.activeWorkspaceID,
            nodes: remotePayload.nodes,
            rootIDs: remotePayload.rootIDs,
            lastSyncedAt: Date.now(),
        });
        lastPushedHash = fastHash(JSON.stringify({
            workspaces: remotePayload.workspaces,
            activeWorkspaceID: remotePayload.activeWorkspaceID,
            nodes: remotePayload.nodes,
            rootIDs: remotePayload.rootIDs,
        }));
    }
}

export function setupSyncListeners(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        const treeChange = changes.tabTreeData;
        if (!treeChange) return;

        const oldData = treeChange.oldValue as TreeStorageSchema | undefined;
        const newData = treeChange.newValue as TreeStorageSchema | undefined;

        const hasWorkspacesChanged = JSON.stringify(oldData?.workspaces) !== JSON.stringify(newData?.workspaces);
        const hasNodesChanged = JSON.stringify(oldData?.nodes) !== JSON.stringify(newData?.nodes);
        const hasRootsChanged = JSON.stringify(oldData?.rootIDs) !== JSON.stringify(newData?.rootIDs);
        const hasActiveWSChanged = oldData?.activeWorkspaceID !== newData?.activeWorkspaceID;

        if (hasWorkspacesChanged || hasNodesChanged || hasRootsChanged || hasActiveWSChanged) {
            triggerDebouncedPush();
        }
    });

    chrome.windows.onFocusChanged.addListener((windowID) => {
        if (windowID === chrome.windows.WINDOW_ID_NONE) flushPendingSync();
    });

    if (chrome.idle) {
        chrome.idle.setDetectionInterval(60);
        chrome.idle.onStateChanged.addListener((newState) => {
            if (newState === "idle" || newState == "locked") flushPendingSync();
        });
    }
}
