import { StorageService } from "./storage";
import { type SyncPayload, type TabNode, type TreeStorageSchema } from "../types";
import { URLs } from "../requestURLs/urls";

const WURL = URLs['prod'];

const DEBOUNCE_DELAY = 20000; // 20s batching window
const MAX_WAIT_DELAY = 300000; // 5m max wait
const FLUSH_ALARM = "sync-flush";
const PULL_ALARM = "cloud-pull-sync";

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let maxWaitTimer: ReturnType<typeof setTimeout> | null = null;

type PushOutcome =
    | { status: "ok"; updatedAt: number }
    | { status: "conflict" | "locked" | "auth" | "error" };
type PullOutcome =
    | { status: "ok"; data: SyncPayload | null }
    | { status: "locked" | "auth" | "error" };

const runExclusive = <T>(task: () => Promise<T>): Promise<T> =>
    navigator.locks.request("tabyrinth-sync", task);

async function recordStatus(state: string, detail?: string): Promise<void> {
    const logMsg = `[SYNC] ${state}${detail ? ` - ${detail}` : ""}`;
    console.log(logMsg);
    await chrome.storage.local.set({
        syncStatus: {
            state,
            detail,
            at: new Date().toISOString(),
            timestamp: Date.now()
        }
    });
}

async function contentHash(state: TreeStorageSchema): Promise<string> {
    const { workspaces, nodes, rootIDs, groups, moodboardItems, hotTabs } = state;
    const bytes = new TextEncoder().encode(
        JSON.stringify({ workspaces, nodes, rootIDs, groups, moodboardItems, hotTabs })
    );
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getDeviceID(): Promise<string> {
    return navigator.locks.request("tabyrinth-device-id", async () => {
        const { deviceId } = await chrome.storage.local.get("deviceId");
        if (typeof deviceId === "string") return deviceId;
        const fresh = crypto.randomUUID();
        await chrome.storage.local.set({ deviceId: fresh });
        return fresh;
    });
}

export async function validatePersistedLicense(): Promise<boolean> {
    return isProActive();
}

export async function getLicenseKey(): Promise<string | null> {
    const { licenseKey } = await chrome.storage.local.get("licenseKey");
    return typeof licenseKey === "string" && licenseKey.length > 0 ? licenseKey : null;
}

export async function isProActive(): Promise<boolean> {
    const { isPro, licenseKey } = await chrome.storage.local.get(["isPro", "licenseKey"]);
    return isPro === true && typeof licenseKey === "string" && licenseKey.length > 0;
}

export async function activateLicenseKey(rawKey: string): Promise<{ success: boolean; error?: string }> {
    const key = rawKey.trim();
    try {
        const deviceID = await getDeviceID();
        const response = await fetch(`${WURL}/api/verify-key`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${key}`,
                "X-Device-ID": deviceID,
            },
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            return { success: false, error: data.error ?? `Activation failed (${response.status})` };
        }

        await chrome.storage.local.set({ licenseKey: key, isPro: true });
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}

export async function createCheckoutSession(email: string): Promise<string> {
    const result = await fetch(`${WURL}/api/create-payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
    });

    const data = await result.json();
    if (!result.ok) {
        throw new Error(data.error || "Failed to initiate payment");
    }
    return data.paymentUrl;
}

async function call(method: "GET" | "POST", body?: SyncPayload): Promise<Response | null> {
    const licenseKey = await getLicenseKey();
    if (!licenseKey) return null;

    try {
        return await fetch(`${WURL}/api/sync`, {
            method,
            headers: {
                ...(body ? { "Content-Type": "application/json" } : {}),
                "Authorization": `Bearer ${licenseKey}`,
                "X-Device-ID": await getDeviceID(),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
    } catch (err) {
        console.error("[SYNC] network error:", err);
        return null;
    }
}

async function handleAuthFailure(res: Response): Promise<void> {
    const body = await res.json().catch(() => ({}));
    await recordStatus("auth", `${res.status} ${body.code ?? body.error ?? ""}`.trim());

    if (body.code === "INVALID_KEY" || body.code === "LICENSE_INACTIVE") {
        await chrome.storage.local.set({ isPro: false });
        await chrome.storage.local.remove("licenseKey");
    }
}

async function pull(): Promise<PullOutcome> {
    console.log("[SYNC] Fetching remote data...");
    const res = await call("GET");
    if (!res) return { status: "error" };
    if (res.status === 429) return { status: "locked" };
    if (res.status === 401 || res.status === 403) {
        await handleAuthFailure(res);
        return { status: "auth" };
    }
    if (!res.ok) {
        await recordStatus("error", `pull ${res.status}`);
        return { status: "error" };
    }
    const body = await res.json();
    console.log("[SYNC] Pull successful");
    return { status: "ok", data: body.data ?? null };
}

async function push(payload: SyncPayload): Promise<PushOutcome> {
    const res = await call("POST", payload);
    if (!res) return { status: "error" };
    if (res.status === 409) return { status: "conflict" };
    if (res.status === 429) return { status: "locked" };
    if (res.status === 401 || res.status === 403) {
        await handleAuthFailure(res);
        return { status: "auth" };
    }
    if (!res.ok) {
        await recordStatus("error", `push ${res.status}`);
        return { status: "error" };
    }
    const body = await res.json();
    return { status: "ok", updatedAt: body.updatedAt };
}

function mergeById<T extends { id: string }>(local: T[], remote: T[]): T[] {
    const merged = new Map(local.map((item) => [item.id, item]));
    remote.forEach((item) => merged.set(item.id, item));
    return [...merged.values()];
}

async function applyRemote(remote: SyncPayload): Promise<void> {
    const liveTabs = await chrome.tabs.query({});
    const liveIDs = new Set(liveTabs.map((tab) => String(tab.id)));

    await StorageService.transaction((state) => {
        const incoming: Record<string | number, TabNode> = {};
        for (const [id, node] of Object.entries(remote.nodes)) {
            if (liveIDs.has(String(id))) continue;
            incoming[id] = {
                ...node,
                windowID: node.windowID ?? chrome.windows.WINDOW_ID_NONE,
                isClosed: true,
                isLoading: false,
            };
        }

        return {
            nodes: incoming,
            workspaces: mergeById(state.workspaces ?? [], remote.workspaces),
            moodboardItems: { ...(state.moodboardItems ?? {}), ...(remote.moodboardItems ?? {}) },
            hotTabs: { ...(state.hotTabs ?? {}), ...(remote.hotTabs ?? {}) },
            lastSyncedAt: remote.updatedAt,
        };
    });
}

async function pushIfChanged(allowRetry = true): Promise<void> {
    console.log("[SYNC] Checking for changes to push...");
    const state = await StorageService.get();
    if (!Array.isArray(state.workspaces)) {
        console.warn("[SYNC] Aborting push: state.workspaces is not an array");
        return;
    }

    const hash = await contentHash(state);
    const { syncHash } = await chrome.storage.local.get("syncHash");

    console.log(`[SYNC] Hash check: current=${hash}, lastPushed=${syncHash}`);
    if (hash === syncHash) {
        console.log("[SYNC] No changes detected. Skipping push.");
        return;
    }

    const payload: SyncPayload = {
        updatedAt: Date.now(),
        baseUpdatedAt: state.lastSyncedAt ?? 0,
        workspaces: state.workspaces,
        activeWorkspaceID: state.activeWorkspaceID ?? "",
        nodes: state.nodes ?? {},
        rootIDs: state.rootIDs ?? [],
        groups: state.groups ?? {},
        moodboardItems: state.moodboardItems,
        hotTabs: state.hotTabs,
    };

    console.log("[SYNC] Sending push request...");
    const result = await push(payload);

    if (result.status === "ok") {
        console.log(`[SYNC] Push successful. Server updatedAt: ${result.updatedAt}`);
        await StorageService.set({ lastSyncedAt: result.updatedAt });
        await chrome.storage.local.set({ syncHash: hash });
        await recordStatus("ok", "pushed");
        return;
    }

    if (result.status === "conflict" && allowRetry) {
        console.log("[SYNC] Conflict (409) detected. Attempting pull-merge-push...");
        const pulled = await pull();
        if (pulled.status === "ok" && pulled.data) {
            await applyRemote(pulled.data);
            console.log("[SYNC] Merge complete. Retrying push...");
            await pushIfChanged(false);
            return;
        } else {
            console.error("[SYNC] Conflict resolution failed during pull.");
        }
    }

    await recordStatus(result.status, "push_failed");
}

async function reconcile(): Promise<void> {
    if (!(await isProActive())) return;

    const pulled = await pull();
    if (pulled.status !== "ok") {
        if (pulled.status !== "auth") await recordStatus(pulled.status, "pull");
        return;
    }

    const { lastSyncedAt = 0 } = await StorageService.get();
    if (pulled.data && pulled.data.updatedAt > lastSyncedAt) {
        await applyRemote(pulled.data);
    }
    await pushIfChanged();
}

export function initializeSync(): Promise<void> {
    return runExclusive(reconcile);
}

export async function flushPendingSync(): Promise<void> {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (maxWaitTimer) { clearTimeout(maxWaitTimer); maxWaitTimer = null; }
    void chrome.alarms.clear(FLUSH_ALARM);

    await runExclusive(async () => {
        if (!(await isProActive())) return;
        await pushIfChanged();
    });
}

export function triggerDebouncedPush(): void {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void flushPendingSync(), DEBOUNCE_DELAY);
    maxWaitTimer ??= setTimeout(() => void flushPendingSync(), MAX_WAIT_DELAY);

    chrome.alarms.create(FLUSH_ALARM, { delayInMinutes: 0.5 });
}

let listenersInitialized = false;

export function setupSyncListeners(): void {
    if (listenersInitialized) return;
    listenersInitialized = true;

    console.log("[SYNC] Setting up listeners...");
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;

        if (changes.licenseKey?.newValue) void initializeSync();

        const treeChange = changes.tabTreeData;
        if (!treeChange) return;

        const oldData = treeChange.oldValue as TreeStorageSchema | undefined;
        const newData = treeChange.newValue as TreeStorageSchema | undefined;
        const differs = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

        // Filter out noisy updates (active tab, media tab, loading state)
        const hasChanged =
            differs(oldData?.workspaces, newData?.workspaces) ||
            differs(oldData?.nodes, newData?.nodes) ||
            differs(oldData?.rootIDs, newData?.rootIDs) ||
            differs(oldData?.moodboardItems, newData?.moodboardItems) ||
            differs(oldData?.hotTabs, newData?.hotTabs);

        if (hasChanged) {
            void isProActive().then((pro) => { if (pro) triggerDebouncedPush(); });
        }
    });

    chrome.windows.onFocusChanged.addListener((windowID) => {
        if (windowID === chrome.windows.WINDOW_ID_NONE) void flushPendingSync();
    });

    if (chrome.idle) {
        chrome.idle.setDetectionInterval(60);
        chrome.idle.onStateChanged.addListener((newState) => {
            if (newState === "idle" || newState === "locked") void flushPendingSync();
        });
    }

    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === FLUSH_ALARM) void flushPendingSync();
        if (alarm.name === PULL_ALARM) void initializeSync();
    });

    void chrome.alarms.get(PULL_ALARM).then((existing) => {
        if (!existing) chrome.alarms.create(PULL_ALARM, { periodInMinutes: 5 });
    });
}
