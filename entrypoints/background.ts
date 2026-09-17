import { defineBackground } from "#imports";
import { StorageService } from "@/src/services/storage";
import { type TabNode } from "@/src/types";
import { getAccentColorFromURL } from "@/src/utils/mediaColors";
import { initializeSync, setupSyncListeners } from "@/src/services/sync";


// not the best 
const RESOURCE_ID_KEYS = new Set([
  'v', 'id', 'item', 'doc', 'article', 'page_id'
]);

function isPlaceholder(url: string, title: string): boolean {
  const u = (url || '').toLowerCase();
  const t = (title || '').toLowerCase();
  return u === '' || u === 'about:blank' || u.startsWith('chrome://newtab') || t === 'new tab';
}

// edge case: SPAs like google fonts
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
        // split
        return false;
      }
    }

    return true;
  } catch {
    return false;
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
    // if (next !== currentlyTracked) {
    //   await StorageService.setActiveMediaTab(next);
    // }
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

  setupSyncListeners();

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
  // sync tabs with the storage
  syncExistingTabs();

  // on install
  chrome.runtime.onInstalled.addListener(async () => {
    await initializeSync();

    chrome.contextMenus.create({
      id: "add-note-to-tab",
      title: "Add note to tab",
      contexts: ["selection", "page"]
    });
  });

  // on startup
  chrome.runtime.onStartup.addListener(async () => {
    await initializeSync();
    reconcileMediaState();
  });

  // keybind opens sidebar
  chrome.commands.onCommand.addListener((command, tab) => {
    if (command !== "open-tabyrinth") return;
    if (tab?.windowId === undefined) return;
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(console.error);
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "add-note-to-tab" && tab?.id) {
      const noteText = info.selectionText || info.pageUrl || "";
      if (noteText.trim().length > 0) {
        await StorageService.addNoteToTab(tab.id, noteText, info.pageUrl);
      }
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'keepalive') return;
    port.onMessage.addListener(() => {
      reconcileMediaState();
    });
  });

  //todo: remove redundant listener 
  chrome.runtime.onStartup.addListener(() => {
    reconcileMediaState();
  });

  //** fix for race condition: tab creation from ghost tab 
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type == 'reopen-node') {
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

  // activation
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await StorageService.set({
      lastActiveTabID: activeInfo.tabId
    });
  });

  // tab creation (new tab no parent -> automatically a root node)
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

  // tab updation
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

      // same page, metadata only -> no split
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

      // navigation -> split so the old page stays in the tree
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

      // point the old parent at the history node instead of the live tab
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

  // tab close / removal
  chrome.tabs.onRemoved.addListener(async (tabID) => {
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

  // detect background audio 
  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.audible !== undefined) {
      const state = await StorageService.get();

      if (changeInfo.audible) {
        // Pin this newly playing tab as the active media tab
        await StorageService.setActiveMediaTab(tabId);
      } else if (state.activeMediaTabID === tabId) {
        // Tab went silent: Check if any other tab is playing audio
        const audibleTabs = await chrome.tabs.query({ audible: true });
        const nextTabId = audibleTabs.length > 0 ? audibleTabs[0]?.id ?? null : null;
        await StorageService.setActiveMediaTab(nextTabId);
      }
    }
  });

  // Clear pinned tab if it gets closed
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    const state = await StorageService.get();
    if (state.activeMediaTabID === tabId) {
      const audibleTabs = await chrome.tabs.query({ audible: true });
      const nextTabId = audibleTabs.length > 0 ? audibleTabs[0]?.id ?? null : null;
      await StorageService.setActiveMediaTab(nextTabId);
    }
  });


  //periodic remote pulling
  // todo: Ill see if I genuinely need this feature
  chrome.alarms.create('cloud-pull-sync', { periodInMinutes: 5 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'cloud-pull-sync') initializeSync();
  });
});
