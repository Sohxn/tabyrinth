import { type SyncPayload } from "../types";
import { URLs } from "../requestURLs/urls";

const WURL = URLs['prod'];

let pushTimer: ReturnType<typeof setTimeout> | null = null;

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

export async function activateLicenseKey(rawKey: string): Promise<{
    success: boolean;
    error?: string
}> {
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

export function triggerDebouncedPush(payload: SyncPayload, delay = 3000) {
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
        await pushSync(payload);
        pushTimer = null;
    }, delay);
}

export async function initializeSync(): Promise<void> {
    const isPro = (await chrome.storage.local.get("isPro")).isPro;
    if (!isPro) return;

    const { data: remotePayload, locked } = await pullSync();
    if (locked || !remotePayload) return;

    const localData = await chrome.storage.local.get("workspaces");
    const localUpdatedAt = (localData.workspaces as { updatedAt?: number })?.updatedAt ?? 0;

    if (remotePayload.updatedAt > localUpdatedAt) {
        await chrome.storage.local.set({
            workspaces: remotePayload.workspaces,
            lastSyncedAt: Date.now()
        });
    }
}

