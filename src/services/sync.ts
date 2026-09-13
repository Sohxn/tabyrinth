import { type SyncPayload } from "../types";
import { URLs } from "../requestURLs/urls";

const WURL = URLs['prod'];

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

export async function pushSync(payload: SyncPayload): Promise<boolean> {
    const lk = await getLicenseKey();
    if (!getLicenseKey) return false;

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
        return response.ok;
    } catch (err) {
        console.error("push failed: ", err);
        return false;
    }
}

export async function pullSync(): Promise<SyncPayload | null> {
    const lk = await getLicenseKey();
    if (!getLicenseKey) return null;

    try {
        const deviceID = await getDeviceID();
        const response = await fetch(`${WURL}/api/sync`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${lk}`,
                "X-Device-ID": deviceID,
            },
        });

        if (!response.ok) return null;
        const result = await response.json();
        return result.data || null;
    } catch (err) {
        console.error("pull failed: ", err);
        return null;
    }
}


// test entire sync loop locally using a manual hashed test key in kv store


