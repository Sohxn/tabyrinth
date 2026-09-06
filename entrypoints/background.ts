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
    if(changeInfo.status == 'complete' || !tab.url) return;

    const state = await StorageService.get();
    const existing = state.nodes[tabID];

    if(existing){
      const cleanOldURL = existing.url.split('#')[0];
      const cleanNewURL = tab.url.split('#')[0];
      if(cleanOldURL !== cleanNewURL && existing.title != 'New Tab'){
        const historyNodeID =  `hist_${tabID}_${Date.now()}`;
        const historyNode: TabNode = {
          ...existing,
          id: historyNodeID,
          isHistoryNode: true,
          isClosed: true,
          childrenIDs: [tabID],
        };

        const updatedActiveNode: TabNode = {
          id: tabID,
          title: tab.title || 'New Page',
          url: tab.url,
          parentID: historyNodeID,
          windowID: tab.windowId,
          favIconURL: tab.favIconUrl,
          isClosed: false,
          childrenIDs: existing.childrenIDs.filter((id) => String(id) !== historyNodeID),
        };

        const updatedNodes = {
          ...state.nodes,
          [historyNodeID]: historyNode,
          [tabID]: updatedActiveNode
        };

        // swap root pointer if the old tab was the root tab
        let updatedRoots = [...state.rootIDs]
        if (state.rootIDs.includes(tabID)){
          updatedRoots = updatedRoots.map((rootID) => (rootID === tabID ? historyNodeID : rootID));
        }

        
        const parentNode = existing.parentID ? updatedNodes[existing.parentID] : undefined;
        if(existing.parentID && parentNode){
          const newChildren = parentNode.childrenIDs.map((childID) => (childID === tabID ? historyNodeID : childID));
          updatedNodes[existing.parentID] = { ...parentNode, childrenIDs: newChildren };
        }

        await StorageService.set({
          nodes: updatedNodes, 
          rootIDs: updatedRoots
        });

      }
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

