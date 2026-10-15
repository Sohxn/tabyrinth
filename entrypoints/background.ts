import { defineBackground } from "#imports";
import { StorageService } from "@/src/services/storage";
import { type TabNode } from "@/src/types";
import { getAccentColorFromURL } from "@/src/utils/mediaColors";
import { validatePersistedLicense, initializeSync, setupSyncListeners, isProActive } from "@/src/services/sync";
import { smartTextToHTML } from '@/src/utils/noteText'
import { sanitizeHTML } from "@/src/utils/sanitizeHTML";
import { captureSourceInPage } from "@/src/utils/citationCapture";
import { generateCiteKey } from "@/src/utils/citeKey";

const REMOTE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const RESOURCE_ID_KEYS = new Set([
  'v', 'id', 'item', 'doc', 'article', 'page_id'
]);

function isPlaceholder(url: string, title: string): boolean {
  const u = (url || '').toLowerCase();
  const t = (title || '').toLowerCase();
  return u === '' || u === 'about:blank' || u.startsWith('chrome://newtab') || t === 'new tab';
}

function isSamePageNavigation(oldUrlStr: string, newUrlStr: string): boolean {
  if (!oldUrlStr || !newUrlStr) return false;

  const cleanOld = oldUrlStr.split('#')[0];
  const cleanNew = newUrlStr.split('#')[0];

  if (cleanOld === cleanNew) return true;

  try {
    const oldUrl = new URL(oldUrlStr);
    const newUrl = new URL(newUrlStr);

    if (oldUrl.origin !== newUrl.origin || oldUrl.pathname !== newUrl.pathname) {
      return false;
    }

    const oldParams = oldUrl.searchParams;
    const newParams = newUrl.searchParams;

    for (const key of RESOURCE_ID_KEYS) {
      if (oldParams.has(key) && newParams.has(key) && oldParams.get(key) !== newParams.get(key)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}


async function bootExtension() {
  console.log("checking for license");

  try {
    await StorageService.sweepStaleRemoteNodes(REMOTE_TTL_MS);
  } catch (err) {
    console.warn("[CLOUD] Stale sweep failed:", err);
  }

  // Register listeners unconditionally — every callback self-gates on isProActive().
  // This lets activation mid-session wake sync immediately instead of waiting
  // for the MV3 service worker to restart.
  setupSyncListeners();

  const isPro = await validatePersistedLicense();
  if (isPro) {
    await initializeSync();
    console.log("Pro activated, sync restored.");
  } else {
    console.log("No license found: Running guest mode.");
  }
}

async function reconcileMediaState() {
  const state = await StorageService.get();
  const audibleTabs = await chrome.tabs.query({ audible: true });
  const currentlyTracked = state.activeMediaTabID;

  const stillAudible = audibleTabs.find((t) => t.id === currentlyTracked);

  if (!stillAudible) {
    const nextTab = audibleTabs.length > 0 ? audibleTabs[0] : null;
    const nextTabID = nextTab?.id ?? null;
    const nextAccentColor = nextTab ? getAccentColorFromURL(nextTab.url) : null;

    await StorageService.set({
      activeMediaTabID: nextTabID,
      activeMediaAccentColor: nextAccentColor
    });
  } else {
    const currentColor = getAccentColorFromURL(stillAudible.url);
    if (state.activeMediaAccentColor !== currentColor) {
      await StorageService.set({
        activeMediaAccentColor: currentColor,
      });
    }
  }
}

export default defineBackground(() => {

  // boot extension on every wake-up to ensure listeners are active
  bootExtension();

  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch(console.error);

  const syncExistingTabs = async () => {
    await StorageService.resetToActiveTabsOnly();

    const state = await StorageService.get();
    const activeWSID = state.activeWorkspaceID;

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      const tabNode: TabNode = {
        id: tab.id,
        title: tab.title || 'New Tab',
        url: tab.url || tab.pendingUrl || 'chrome://newtab/',
        parentID: tab.openerTabId ?? null,
        windowID: tab.windowId,
        favIconURL: tab.favIconUrl,
        isLoading: tab.status === 'loading',
        isClosed: false,
        childrenIDs: [],
        workspaceID: activeWSID
      };
      await StorageService.upsertNode(tabNode);
    }
  };

  chrome.runtime.onInstalled.addListener(async () => {
    await syncExistingTabs();
    await bootExtension();

    chrome.contextMenus.create({
      id: "add-note-to-tab",
      title: "Add note to tab",
      contexts: ["selection", "page"]
    });

    chrome.contextMenus.create({
      id: "pin-image-to-board",
      title: "Pin image to board",
      contexts: ["image"]
    });

    chrome.contextMenus.create({
      id: "pin-selection-to-board",
      title: "Pin selection to board",
      contexts: ["selection"]
    });

    chrome.contextMenus.create({
      id: "capture-citation",
      title: "Capture citation metadata",
      contexts: ["page"]
    });
  });

  chrome.runtime.onStartup.addListener(async () => {
    await syncExistingTabs();
    await bootExtension();
    reconcileMediaState();
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (command === "open-tabyrinth") {
      if (tab?.windowId === undefined) return;
      chrome.sidePanel.open({
        windowId: tab.windowId
      }).catch(console.error);
      return;
    }
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "add-note-to-tab" && tab?.id) {
      try {
        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return "";
            const container = document.createElement("div");
            container.appendChild(selection.getRangeAt(0).cloneContents());
            container.querySelectorAll('a').forEach(a => a.href = a.href);
            return container.innerHTML;
          }
        });

        const rawHTML = injectionResults[0]?.result || info.pageUrl || "";

        if (rawHTML.trim().length > 0) {
          const htmlToSave = rawHTML.includes('<') ? rawHTML : smartTextToHTML(rawHTML);
          await StorageService.addNoteToTab(tab.id, htmlToSave, info.pageUrl);
        }
      } catch (err) {
        console.error('[ERROR] Failed to capture selection: ', err);
      }
    }

    if (info.menuItemId === "pin-image-to-board" && info.srcUrl) {
      try {
        const state = await StorageService.get();
        const item = await StorageService.addMoodboardItem({
          type: 'image',
          content: info.srcUrl,
          sourceURL: info.pageUrl,
          sourceTitle: tab?.title,
          workspaceID: state.activeWorkspaceID
        });
        console.log('[BOARD] Successfully pinned image:', item.id, 'to workspace:', state.activeWorkspaceID);
      } catch (err) {
        console.error('[ERROR] Failed to pin image to board:', err);
      }
    }

    if (info.menuItemId === "pin-selection-to-board" && tab?.id) {
      try {
        const injectionRes = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const selection = window.getSelection();
            if (!selection || selection.rangeCount === 0) return "";
            const container = document.createElement("div");
            container.appendChild(selection.getRangeAt(0).cloneContents());
            return container.innerHTML;
          }
        });

        const rawHTML = injectionRes[0]?.result || "";
        if (rawHTML.trim().length > 0) {
          const state = await StorageService.get();
          const item = await StorageService.addMoodboardItem({
            type: 'note',
            content: rawHTML,
            sourceURL: info.pageUrl,
            sourceTitle: tab?.title,
            workspaceID: state.activeWorkspaceID
          });
          console.log('[BOARD] Successfully pinned selection:', item.id, 'to workspace:', state.activeWorkspaceID);
        }
      } catch (err) {
        console.error("[ERROR] Failed to add selection to board: ", err);
      }
    }

    if (info.menuItemId === "capture-citation" && tab?.id) {
      if (!(await isProActive())) return;
      try {
        const injectionResults = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: captureSourceInPage,
        });
        const raw = injectionResults[0]?.result;
        if (!raw) return;

        const state = await StorageService.get();
        const existingKeys = new Set<string>();
        Object.values(state.nodes).forEach((node) => {
          if (node.source?.citeKey) existingKeys.add(node.source.citeKey);
        });

        const source = {
          ...raw,
          citeKey: generateCiteKey(raw, existingKeys),
          userEdited: [] as string[],
        };
        await StorageService.updateNodeSource(tab.id, source);
        console.log("[CITATION] Captured metadata for tab", tab.id, "key:", source.citeKey);
      } catch (error) {
        console.error("[CITATION] Capture failed:", error);
      }
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'keepalive') return;
    port.onMessage.addListener(() => {
      reconcileMediaState();
    });
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'reopen-node') {
      StorageService.reopenNode(message.nodeID).then(() => sendResponse({
        ok: true
      })).catch((err) => sendResponse({
        ok: false,
        error: String(err)
      }));
      return true;
    }
  });

  chrome.alarms.create('media-reconcile', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'media-reconcile') reconcileMediaState();
  });

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await StorageService.set({
      lastActiveTabID: activeInfo.tabId
    });
  });

  chrome.tabs.onCreated.addListener(async (tab) => {
    if (!tab.id) return;

    const state = await StorageService.get();
    if (state.nodes[tab.id]) return;

    const targetURL = tab.url || tab.pendingUrl || 'chrome://newtab/'
    const isNewTab = targetURL.includes('chrome://newtab') || targetURL.includes('about:blank') || targetURL === '';
    const rawParentID = tab.openerTabId ?? null;
    const activeWSID = state.activeWorkspaceID || 'default';

    const newTabNode: TabNode = {
      id: tab.id,
      title: tab.title || 'New Tab',
      url: targetURL,
      parentID: isNewTab || rawParentID == tab.id ? null : rawParentID,
      windowID: tab.windowId,
      favIconURL: tab.favIconUrl,
      isLoading: tab.status === 'loading',
      isClosed: false,
      childrenIDs: [],
      workspaceID: activeWSID
    };

    await StorageService.upsertNode(newTabNode);
  });

  chrome.tabs.onUpdated.addListener(async (tabID, changeInfo, tab) => {
    if (!tab.url) return;

    const hasRelevantChange = changeInfo.url !== undefined ||
      changeInfo.title !== undefined || changeInfo.favIconUrl !== undefined ||
      changeInfo.status !== undefined || changeInfo.status === 'complete';

    if (!hasRelevantChange) return;

    await StorageService.transaction((state) => {
      const existing = state.nodes[tabID];
      if (!existing) return {};

      const isLoading = changeInfo.status ? changeInfo.status === 'loading' : (tab.status === 'loading');
      const currentURL = tab.url || existing.url;
      const samePage = isSamePageNavigation(existing.url, tab.url!);
      const currWSID = existing.workspaceID || state.activeWorkspaceID || 'default';

      if (samePage || isPlaceholder(existing.url, existing.title)) {
        return {
          nodes: {
            [tabID]: {
              ...existing,
              url: currentURL,
              title: tab.title || existing.title,
              favIconURL: tab.favIconUrl || existing.favIconURL,
              workspaceID: currWSID
            }
          }
        };
      }

      const historyNodeID = `hist_${tabID}_${Date.now()}`;

      const historyNode: TabNode = {
        ...existing,
        id: historyNodeID,
        workspaceID: currWSID,
        isHistoryNode: true,
        isClosed: true,
        isLoading: false,
        childrenIDs: [tabID]
      };

      const updatedActiveNode: TabNode = {
        id: tabID,
        title: tab.title || 'New Page',
        url: tab.url!,
        parentID: historyNodeID,
        windowID: tab.windowId,
        favIconURL: tab.favIconUrl,
        isLoading,
        isClosed: false,
        childrenIDs: existing.childrenIDs.filter((id) => String(id) !== historyNodeID),
        workspaceID: currWSID
      };

      const updatedNodes: Record<string | number, TabNode> = {
        [historyNodeID]: historyNode,
        [tabID]: updatedActiveNode
      };

      if (existing.parentID !== null && existing.parentID !== undefined && state.nodes[existing.parentID]) {
        const parentNode = state.nodes[existing.parentID];
        if (parentNode) {
          updatedNodes[existing.parentID] = {
            ...parentNode,
            childrenIDs: parentNode.childrenIDs.map((cId) => (cId === tabID ? historyNodeID : cId))
          };
        }
      }

      return { nodes: updatedNodes };
    });
  });

  chrome.tabs.onRemoved.addListener(async (tabID, removeInfo) => {
    // If the tab is disappearing because its window/browser is closing, this is
    // not a user-initiated close — the session is simply ending. Leave the node
    // as-is so its open/closed state is preserved across devices.
    if (removeInfo.isWindowClosing) return;

    const state = await StorageService.get();
    const node = state.nodes[tabID];
    if (!node) return;

    const isPlaceholderTab = !node.url || node.url.includes('chrome://newtab') || node.url.includes('about:blank');
    const hasNoChildren = !node.childrenIDs || node.childrenIDs.length === 0;

    if (isPlaceholderTab && hasNoChildren) {
      await StorageService.deleteNode(tabID);
    } else {
      await StorageService.markNodeClosed(tabID);
    }
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.audible !== undefined) {
      const state = await StorageService.get();

      if (changeInfo.audible) {
        await StorageService.setActiveMediaTab(tabId);
      } else if (state.activeMediaTabID === tabId) {
        const audibleTabs = await chrome.tabs.query({ audible: true });
        const nextTabId = audibleTabs.length > 0 ? audibleTabs[0]?.id ?? null : null;
        await StorageService.setActiveMediaTab(nextTabId);
      }
    }
  });

  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const state = await StorageService.get();
    if (state.activeMediaTabID === tabId) {
      const audibleTabs = await chrome.tabs.query({ audible: true });
      const nextTabId = audibleTabs.length > 0 ? audibleTabs[0]?.id ?? null : null;
      await StorageService.setActiveMediaTab(nextTabId);
    }
  });
});
