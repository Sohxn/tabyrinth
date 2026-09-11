import { type TreeStorageSchema, type TabNode, type TabNote } from "../types";

const InitState: TreeStorageSchema = {
  nodes: {},
  rootIDs: [],
  lastActiveTabID: null,
  activeMediaTabID: null,
  isPro: false,
};

let storageQueue: Promise<any> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    storageQueue = storageQueue.then(task).then(resolve).catch(reject);
  });
};

function sanitizeTree(nodes: Record<string | number, TabNode>): {
  nodes: Record<string | number, TabNode>;
  rootIDs: (string | number)[];
} {
  const cleanedNodes: Record<string | number, TabNode> = {};

  Object.values(nodes).forEach((node) => {
    const hasParent = node.parentID !== null && node.parentID !== undefined;
    const parentExists = hasParent && !!nodes[node.parentID as string | number];

    cleanedNodes[node.id] = {
      ...node,
      parentID: parentExists ? node.parentID : null,
      childrenIDs: node.childrenIDs ? [...node.childrenIDs] : [],
    };
  });

  const rootIDs: (string | number)[] = [];
  Object.values(cleanedNodes).forEach((node) => {
    if (node.parentID === null) {
      rootIDs.push(node.id);
    }
  });


  Object.values(cleanedNodes).forEach((node) => {
    const validChildIDs = Array.from(new Set(node.childrenIDs)).filter(
      (childID) =>
        !!cleanedNodes[childID] && cleanedNodes[childID].parentID === node.id
    );
    cleanedNodes[node.id] = { ...node, childrenIDs: validChildIDs };
  });

  return { nodes: cleanedNodes, rootIDs };
}

export const StorageService = {

  async transaction(
    fn: (state: TreeStorageSchema) => Partial<TreeStorageSchema> | Promise<Partial<TreeStorageSchema>>
  ): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get('tabTreeData');
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;

      const patch = await fn(state);
      const mergedNodes = patch.nodes ? { ...state.nodes, ...patch.nodes } : state.nodes;
      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots } = sanitizeTree(mergedNodes);

      await chrome.storage.local.set({
        tabTreeData: { ...state, ...patch, nodes: sanitizedNodes, rootIDs: sanitizedRoots }
      });
    });
  },

  async get(): Promise<TreeStorageSchema> {
    const data = await chrome.storage.local.get('tabTreeData');
    return (data.tabTreeData as TreeStorageSchema) || InitState;
  },

  async set(patch: Partial<TreeStorageSchema>): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get('tabTreeData');
      const current = (data.tabTreeData as TreeStorageSchema) || InitState;

      // Actually merge, don't replace — a partial nodes patch should not
      // wipe out every tab that wasn't included in it.
      const mergedNodes = patch.nodes
        ? { ...current.nodes, ...patch.nodes }
        : current.nodes;
      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots } = sanitizeTree(mergedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...current,
          ...patch,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
        },
      });
    });
  },

  // edge case for SPA (single page applications)
  async updateNodeProperties(tabID: string | number, updates: Partial<TabNode>): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const target = state.nodes[tabID];
      if (!target) return;

      const updatedNodes = {
        ...state.nodes,
        [tabID]: {
          ...target,
          ...updates,
        },
      };

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: updatedNodes
        },
      });
    });
  },

  async upsertNode(node: TabNode): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const existing = state.nodes[node.id];

      const updatedNodes: Record<string | number, TabNode> = {
        ...state.nodes,
        [node.id]: existing ? {
          ...existing,
          ...node,
          parentID: node.parentID !== null && node.parentID !== undefined ? node.parentID : existing.parentID,
          childrenIDs: node.childrenIDs && node.childrenIDs.length > 0 ? node.childrenIDs : existing.childrenIDs,
        } : {
          ...node,
          childrenIDs: node.childrenIDs ?? []
        },
      };

      if (node.parentID !== null && node.parentID !== undefined) {
        const parent = updatedNodes[node.parentID];
        if (parent && !parent.childrenIDs.includes(node.id)) {
          updatedNodes[parent.id] = {
            ...parent,
            childrenIDs: [...parent.childrenIDs, node.id],
          };
        }
      }

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: { ...state, nodes: sanitizedNodes, rootIDs: sanitizedRoots },
      });
    });
  },

  async markNodeClosed(tabID: string | number): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;

      const target = state.nodes[tabID];
      if (!target) return;

      const updatedNodes = {
        ...state.nodes,
        [tabID]: {
          ...target,
          isClosed: true,
          closedAt: Date.now(),
        },
      };

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: { ...state, nodes: sanitizedNodes, rootIDs: sanitizedRoots },
      });
    });
  },

  // reset all closed / stale nodes and keep only the active tabs
  async resetToActiveTabsOnly(): Promise<void> {
    return enqueue(async () => {
      const openTabs = await chrome.tabs.query({});
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      // fresh
      const freshNodes: Record<string | number, TabNode> = {};

      for (const tab of openTabs) {
        if (!tab.id) continue;
        const existing = state.nodes[tab.id];

        // check isLoading once
        freshNodes[tab.id] = {
          id: tab.id,
          title: tab.title || existing?.title || 'New Tab',
          url: tab.url || tab.pendingUrl || existing?.url || 'chrome://newtab/',
          parentID: null,
          windowID: tab.windowId,
          favIconURL: tab.favIconUrl || existing?.favIconURL,
          isClosed: false,
          isLoading: tab.status === 'loading',
          childrenIDs: [],
        };
      }

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots } = sanitizeTree(freshNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots
        }
      });
    });
  },


  // delete node entirely 
  async deleteNode(nodeId: string | number): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;

      if (!state.nodes[nodeId]) return;

      delete state.nodes[nodeId];

      // Detach from parent node
      Object.values(state.nodes).forEach((n) => {
        n.childrenIDs = n.childrenIDs.filter((id) => id !== nodeId);
      });

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots } = sanitizeTree(state.nodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
        },
      });
    });
  },


  // restore old tree and reopen ghost node
  async reopenNode(oldNodeID: string | number): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const oldNode = state.nodes[oldNodeID];

      if (!oldNode) return;

      //spawn a new browser tab with the node's saved URL
      const newTab = await chrome.tabs.create({ url: oldNode.url, active: true });
      if (!newTab.id) return;

      const newID = newTab.id;
      const updatedNodes = {
        ...state.nodes
      };

      //build revived tab node and remove old ghost node key 
      // (only if tabID changes)
      const revivedNode: TabNode = {
        ...oldNode,
        id: newID,
        isClosed: false,
        windowID: newTab.windowId,
        favIconURL: newTab.favIconUrl || oldNode.favIconURL,
        title: newTab.title || oldNode.title
      };

      if (oldNodeID !== newID) {
        delete updatedNodes[oldNodeID];
      }
      updatedNodes[newID] = revivedNode;

      if (oldNode.parentID !== null && oldNode.parentID !== undefined && updatedNodes[oldNode.parentID]) {
        const parent = updatedNodes[oldNode.parentID];
        if (parent) {
          updatedNodes[oldNode.parentID] = {
            ...parent,
            childrenIDs: parent.childrenIDs.map((id) => (id === oldNodeID ? newID : id)),
          };
        }
      }

      let updatedRoots = [
        ...state.rootIDs
      ];

      if (updatedRoots.includes(oldNodeID)) {
        updatedRoots = updatedRoots.map((id) => (id === oldNodeID ? newID : id));
      }

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: updatedNodes,
          rootIDs: updatedRoots,
          lastActiveTabID: newID
        }
      });
    });
  },

  async setActiveMediaTab(tabID: string | number | null): Promise<void> {
    await this.transaction((state) => ({
      activeMediaTabID: tabID,
    }));
  },


  // per tab notes
  async addNoteToTab(tabID: string | number, content: string, sourceURL?: string): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get('tabTreeData');
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const target = state.nodes[tabID];
      if (!target) return;

      const newNote: TabNote = {
        id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        content: content.trim(),
        createdAt: Date.now(),
        sourceURL: sourceURL
      };

      const updatedNodes = {
        ...state.nodes,
        [tabID]: {
          ...target,
          notes: [...(target.notes || []), newNote],
        },
      };

      const {
        nodes: sanitizedNodes,
        rootIDs: sanitizedRoots
      } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots
        }
      });
    });
  },

  async deleteNoteFromTab(tabID: string | number, noteID: string): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get('tabTreeData');
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const target = state.nodes[tabID];
      if (!target || !target.notes) return;

      const updatedNodes = {
        ...state.nodes,
        [tabID]: {
          ...target,
          nodes: target.notes.filter((n) => n.id !== noteID),
        },
      };

      const {
        nodes: sanitizedNodes,
        rootIDs: sanitizedRoots
      } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots
        },
      });
    });
  },

  // clear tab tree
  async clearAll(): Promise<void> {
    return enqueue(async () => {
      await chrome.storage.local.remove('tabTreeData');
    });
  },
};