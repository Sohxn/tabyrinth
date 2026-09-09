import { defineBackground } from "#imports";
import { StorageService } from "@/src/services/storage";
import { type TabNode } from "@/src/types";

function isPlaceholder(url: string, title: string): boolean {
  const u = (url || '').toLowerCase();
  const t = (title || '').toLowerCase();
  return u === '' || u === 'about:blank' || u.startsWith('chrome://newtab') || t === 'new tab';
}

async function reconcileMediaState() {
  const state = await StorageService.get();
  const audibleTabs = await chrome.tabs.query({ audible: true });
  const currentlyTracked = state.activeMediaTabID;

  const stillAudible = currentlyTracked !== null &&
    audibleTabs.some((t) => t.id === currentlyTracked);

  if (!stillAudible) {
    const next = audibleTabs.length > 0 ? audibleTabs[0]?.id ?? null : null;
    if (next !== currentlyTracked) {
      await StorageService.setActiveMediaTab(next);
    }
  }
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch(console.error);

  const syncExistingTabs = async () => {

    // on startup
    // if set to 'dont retain tab tree'
    await StorageService.clearAll();
    await StorageService.resetToActiveTabsOnly();

    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if(!tab.id) continue;
      const tabNode: TabNode = {
        id: tab.id,
        title: tab.title || 'New Tab',
        url: tab.url || tab.pendingUrl || 'chrome://newtab/',
        parentID: tab.openerTabId ?? null,
        windowID: tab.windowId,
        favIconURL: tab.favIconUrl,
        isClosed: false,
        childrenIDs: []
      };
      await StorageService.upsertNode(tabNode);
    }
  };
  // sync tabs with the storage
  syncExistingTabs();

  // add additional menu items
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
      id: "add-note-to-tab",
      title: "Add note to tab",
      contexts:["selection", "page"] 
    });
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if(info.menuItemId === "add-note-to-tab" && tab?.id){
      const noteText = info.selectionText || info.pageUrl || "";
      if(noteText.trim().length > 0){
        await StorageService.addNoteToTab(tab.id, noteText, info.pageUrl);
      }
    }
  });

  chrome.runtime.onConnect.addListener((port) => {
    if(port.name !== 'keepalive') return;
    port.onMessage.addListener(() => {
      reconcileMediaState();
    });
  });

  chrome.runtime.onStartup.addListener(() => {
    reconcileMediaState();
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
    if(!tab.id) return;

    const targetURL = tab.url || tab.pendingUrl || 'chrome://newtab/'
    const isNewTab = targetURL.includes('chrome://newtab') || targetURL.includes('about:blank') || targetURL === '';
    const rawParentID = tab.openerTabId ?? null;

    const newTabNode: TabNode = {
      id: tab.id,
      title: tab.title || 'New Tab',
      url: tab.url || tab.pendingUrl || 'chrome://newtab/',
      parentID: isNewTab || rawParentID == tab.id ? null : rawParentID,
      windowID: tab.windowId,
      favIconURL: tab.favIconUrl,
      isClosed: false,
      childrenIDs: []
    };
    await StorageService.upsertNode(newTabNode);
  });

  // tab updation
  chrome.tabs.onUpdated.addListener(async (tabID, changeInfo, tab) => {
    if(changeInfo.status !== 'complete' || !tab.url) return;

    await StorageService.transaction((state) => {
      const existing = state.nodes[tabID];
      if(!existing) return {};

      const cleanOldURL = existing.url.split('#')[0];
      const cleanNewURL = tab.url!.split('#')[0];

      // same page, metadata only -> no split
      if(cleanOldURL === cleanNewURL){
        return {
          nodes: {
            [tabID]: {
              ...existing,
              title: tab.title || existing.title,
              favIconURL: tab.favIconUrl || existing.favIconURL
            }
          }
        };
      }

      // leaving a blank/new-tab placeholder -> overwrite in place, no split
      if(isPlaceholder(existing.url, existing.title)){
        return {
          nodes: {
            [tabID]: {
              ...existing,
              url: tab.url!,
              title: tab.title || 'Loading...',
              favIconURL: tab.favIconUrl
            }
          }
        };
      }

      // navigation -> split so the old page stays in the tree
      const historyNodeID = `hist_${tabID}_${Date.now()}`;

      const historyNode: TabNode = {
        ...existing,
        id: historyNodeID,
        isHistoryNode: true,
        isClosed: true,
        childrenIDs: [tabID]
      };

      const updatedActiveNode: TabNode = {
        id: tabID,
        title: tab.title || 'New Page',
        url: tab.url!,
        parentID: historyNodeID,
        windowID: tab.windowId,
        favIconURL: tab.favIconUrl,
        isClosed: false,
        childrenIDs: existing.childrenIDs.filter((id) => String(id) !== historyNodeID)
      };

      const updatedNodes: Record<string | number, TabNode> = {
        [historyNodeID]: historyNode,
        [tabID]: updatedActiveNode
      };

      // point the old parent at the history node instead of the live tab
      if(existing.parentID !== null && existing.parentID !== undefined && state.nodes[existing.parentID]){
        const parentNode = state.nodes[existing.parentID];
        if(parentNode){
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
    if(!node) return;

    const isPlaceholderTab = !node.url || node.url.includes('chrome://newtab') || node.url.includes('about:blank');
    const hasNoChildren = !node.childrenIDs || node.childrenIDs.length === 0;

    if(isPlaceholderTab && hasNoChildren){
      await StorageService.deleteNode(tabID);
    }else{
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


});
