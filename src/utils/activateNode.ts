import { isProActive } from "../services/sync";
import { type TabNode } from "../types";

/** Focuses a live tab or reopens a closed/synced one. */
export async function activateNode(node: TabNode): Promise<boolean> {
    if (node.isRemote && !(await isProActive())) return false;
    if (node.isClosed) {
        await chrome.runtime.sendMessage({ type: 'reopen-node', nodeID: node.id });
        return true;
    }
    try {
        await chrome.tabs.update(Number(node.id), { active: true });
        await chrome.windows.update(node.windowID, { focused: true });
    } catch {
        await chrome.runtime.sendMessage({ type: 'reopen-node', nodeID: node.id });
    }
    return true;
}
