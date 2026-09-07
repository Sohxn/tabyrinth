import { type TreeStorageSchema, type TabNode } from "../types";

const InitState: TreeStorageSchema = {
  nodes: {},
  rootIDs: [],
  lastActiveTabID: null,
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

  async upsertNode(node: TabNode): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;

      const updatedNodes: Record<string | number, TabNode> = {
        ...state.nodes,
        [node.id]: { ...node, childrenIDs: node.childrenIDs ?? [] },
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

  async clearAll(): Promise<void> {
    await chrome.storage.local.remove('tabTreeData');
  },

  // reset all closed / stale nodes and keep only the active tabs
  async resetToActiveTabsOnly(): Promise<void> {
    return enqueue(async () => {
      const openTabs = await chrome.tabs.query({});
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      // fresh
      const freshNodes: Record<string | number, TabNode> = {};

      for(const tab of openTabs){
        if(!tab.id) continue;
        const existing = state.nodes[tab.id];

        freshNodes[tab.id] = {
          id: tab.id,
          title: tab.title || existing?.title || 'New Tab',
          url: tab.url || tab.pendingUrl || existing?.url || 'chrome://newtab/',
          parentID: null,
          windowID: tab.windowId,
          favIconURL: tab.favIconUrl || existing?.favIconURL,
          isClosed: false,
          childrenIDs: [], 
        };
      }

      const {nodes: sanitizedNodes, rootIDs: sanitizedRoots} = sanitizeTree(freshNodes);

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

  async reopenNode(nodeId: string | number): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const oldNode = state.nodes[nodeId];

      if (!oldNode) return;

      //spawn a new browser tab with the node's saved URL
      const newTab = await chrome.tabs.create({ url: oldNode.url, active: true });
      if (!newTab.id) return;

      //remove old closed ID key
      delete state.nodes[nodeId];

      //create updated node under new Chrome Tab ID
      const revivedNode: TabNode = {
        ...oldNode,
        id: newTab.id,
        windowID: newTab.windowId,
        isClosed: false,
      };

      state.nodes[newTab.id] = revivedNode;

      //update parent references to point to the new ID
      if (revivedNode.parentID !== null && state.nodes[revivedNode.parentID]) {
        const parent = state.nodes[revivedNode.parentID];
        if(parent){
          parent.childrenIDs = parent.childrenIDs.map((id) => (id === nodeId ? newTab.id! : id));
        }
      }

      //update children pointers to point to the new parent ID
      revivedNode.childrenIDs.forEach((childId) => {
        if (state.nodes[childId]) {
          state.nodes[childId].parentID = newTab.id!;
        }
      });

      //Update root list if it was a root
      state.rootIDs = state.rootIDs.map((id) => (id === nodeId ? newTab.id! : id));

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
};