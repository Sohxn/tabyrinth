import { defineBackground } from "#imports";
import { StorageService } from "@/src/services/storage";
import { type TabNode } from "@/src/types";

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: true
  }).catch(console.error);

  // activation
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await StorageService.set({ 
      lastActiveTabID: activeInfo.tabId
    });
  });

  // tab creation
  chrome.tabs.onCreated.addListener(async (tab) => {
    if(!tab.id) return;
    const state = await StorageService.get();
    const parentID = tab.openerTabId ?? state.lastActiveTabID;

    const newTabNode: TabNode = {
      id: tab.id,
      title: tab.title || 'New Tab',
      url: tab.url || tab.pendingUrl || 'chrome://newtab/',
      parentID: parentID && parentID !== tab.id ? parentID : null,
      windowID: tab.windowId,
      favIconURL: tab.favIconUrl,
      isClosed: false,
      childrenIDs: []
    };

    await StorageService.upsertNode(newTabNode);
  });

  // tab updation
  chrome.tabs.onUpdated.addListener(async (tabID, changeInfo, tab) => {
    if(changeInfo.status == 'complete') return;

    const state = await StorageService.get();
    const existing = state.nodes[tabID];
    if(existing){
      await StorageService.upsertNode({
        ...existing, 
        url: tab.url || existing.url,
        title: tab.title || existing.title,
        favIconURL: tab.favIconUrl || existing.favIconURL
      });
    }
  });

  // tab close / removal
  chrome.tabs.onRemoved.addListener(async (tabID) => {
    await StorageService.markNodeClosed(tabID);
  });

});

