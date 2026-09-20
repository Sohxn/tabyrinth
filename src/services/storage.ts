import { type TreeStorageSchema, type TabNode, type TabNote, type TabGroup } from "../types";

const InitState: TreeStorageSchema = {
  nodes: {},
  rootIDs: [],
  groups: {},
  lastActiveTabID: null,
  activeMediaTabID: null,
  activeMediaAccentColor: '#ffffff',
  isPro: false,
  activeWorkspaceID: 'workspace-default',
  workspaces: [{
    id: 'workspace-default',
    name: 'untitled',
    isDefault: true
  }]
};

let storageQueue: Promise<any> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    storageQueue = storageQueue.then(task).then(resolve).catch(reject);
  });
};

// helper for derive groups
function collectDescendants(nodeID: string | number, nodes: Record<string | number, TabNode>): (string | number)[] {
  const node = nodes[nodeID];
  if (!node) return [];
  let all: (string | number)[] = [nodeID];
  for (const childID of node.childrenIDs) {
    all = all.concat(collectDescendants(childID, nodes));
  }
  return all;
}

function isEntirelyClosed(nodeID: string | number, nodes: Record<string | number, TabNode>): boolean {
  const node = nodes[nodeID];
  if (!node) return true;
  if (!node.isClosed) return false;
  for (const childID of node.childrenIDs) {
    if (!isEntirelyClosed(childID, nodes)) return false;
  }
  return true;
}

// derive groups from tabs
function deriveGroups(nodes: Record<string | number, TabNode>, rootIDs: (string | number)[]): Record<string, TabGroup> {
  const groups: Record<string, TabGroup> = {};
  const ghostsByWorkspace: Record<string, (string | number)[]> = {};

  rootIDs.forEach((rootID) => {
    const root = nodes[rootID];
    if (!root) return;
    const hasChildren = root.childrenIDs && root.childrenIDs.length > 0;
    const wsID = root.workspaceID || 'workspace-default';

    if (hasChildren) {
      const wholeChainClosed = isEntirelyClosed(rootID, nodes);
      if (wholeChainClosed) {
        if (!ghostsByWorkspace[wsID]) ghostsByWorkspace[wsID] = [];
        ghostsByWorkspace[wsID].push(rootID);
      } else {
        const groupID = `chain_${rootID}`;
        groups[groupID] = {
          id: groupID,
          type: 'chain',
          workspaceID: wsID,
          rootID,
          nodeIDs: collectDescendants(rootID, nodes)
        };
      }
    } else if (root.isClosed) {
      if (!ghostsByWorkspace[wsID]) ghostsByWorkspace[wsID] = [];
      ghostsByWorkspace[wsID].push(rootID);
    }
  });

  Object.entries(ghostsByWorkspace).forEach(([wsID, nodeIDs]) => {
    const groupID = `ghost_${wsID}`;
    groups[groupID] = {
      id: groupID,
      type: 'ghost',
      workspaceID: wsID,
      nodeIDs
    };
  });

  return groups;
}

function sanitizeTree(nodes: Record<string | number, TabNode>): {
  nodes: Record<string | number, TabNode>;
  rootIDs: (string | number)[];
  groups: Record<string, TabGroup>;
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

  const groups = deriveGroups(cleanedNodes, rootIDs)

  return { nodes: cleanedNodes, rootIDs, groups };
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
      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups } = sanitizeTree(mergedNodes);

      await chrome.storage.local.set({
        tabTreeData: { ...state, ...patch, nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups }
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
      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups } = sanitizeTree(mergedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...current,
          ...patch,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
          groups
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

      // update: tree consistency 
      const {
        nodes: sanitizedNodes,
        rootIDs: sanitizedRoots,
        groups
      } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          roots: sanitizedRoots,
          groups
        },
      });
    });
  },

  async upsertNode(node: TabNode): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const existing = state.nodes[node.id];

      const parentNode = node.parentID ? state.nodes[node.parentID] : null;
      const assignedWorkspace = node.workspaceID || parentNode?.workspaceID || state.activeWorkspaceID || 'workspace-default';

      //solved race condition
      const updatedNodes: Record<string | number, TabNode> = {
        ...state.nodes,
        [node.id]: existing ? {
          ...existing,
          ...node,
          workspaceID: existing.workspaceID || assignedWorkspace,
          parentID: node.parentID !== null && node.parentID !== undefined ? node.parentID : existing.parentID,
          childrenIDs: node.childrenIDs && node.childrenIDs.length > 0 ? node.childrenIDs : existing.childrenIDs,
        } : {
          ...node,
          workspaceID: assignedWorkspace,
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

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: { ...state, nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups },
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

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: { ...state, nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups },
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
      const assignedWorkspace = state.activeWorkspaceID || 'workspace-default';

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
          workspaceID: existing?.workspaceID || assignedWorkspace
        };
      }

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups } = sanitizeTree(freshNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
          groups
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

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups } = sanitizeTree(state.nodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
          groups
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

      // **fix: link the orphaned children as well on ghost tab revival
      if (oldNode.childrenIDs && oldNode.childrenIDs.length > 0) {
        oldNode.childrenIDs.forEach((childID) => {
          const child = updatedNodes[childID];
          if (child) {
            updatedNodes[childID] = {
              ...child,
              parentID: newID
            }
          }
        });
      }

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

      // revert if doesnt work
      // let updatedRoots = [
      //   ...state.rootIDs
      // ];

      // if (updatedRoots.includes(oldNodeID)) {
      //   updatedRoots = updatedRoots.map((id) => (id === oldNodeID ? newID : id));
      // }

      const {
        nodes: sanitizedNodes,
        rootIDs: sanitizedRoots,
        groups
      } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
          groups,
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
        rootIDs: sanitizedRoots,
        groups
      } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
          groups
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
        rootIDs: sanitizedRoots,
        groups
      } = sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
          groups
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