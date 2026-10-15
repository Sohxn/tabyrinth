import { type TreeStorageSchema, type TabNode, type TabNote, type TabGroup, type MoodboardItem, type HotTabSet } from "../types";

const InitState: TreeStorageSchema = {
  nodes: {},
  rootIDs: [],
  groups: {},
  lastActiveTabID: null,
  activeMediaTabID: null,
  activeMediaAccentColor: '#ffffff',
  activeWorkspaceID: 'workspace-default',
  moodboardItems: {},
  moodboardVisible: false,
  hotTabs: {},
  workspaces: [{
    id: 'workspace-default',
    name: 'untitled',
    isDefault: true
  }]
};

// Use Web Locks API to serialize storage access across all extension contexts
const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  return navigator.locks.request("tabyrinth-storage", task) as Promise<T>;
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

  async upsertNode(node: TabNode): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const existing = state.nodes[node.id];

      const parentNode = node.parentID ? state.nodes[node.parentID] : null;
      const assignedWorkspace = node.workspaceID || parentNode?.workspaceID || state.activeWorkspaceID || 'workspace-default';

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

  async resetToActiveTabsOnly(): Promise<void> {
    return enqueue(async () => {
      const openTabs = await chrome.tabs.query({});
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const freshNodes: Record<string | number, TabNode> = {};
      const assignedWorkspace = state.activeWorkspaceID || 'workspace-default';

      for (const tab of openTabs) {
        if (!tab.id) continue;
        const existing = state.nodes[tab.id];

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

  async deleteNode(nodeId: string | number): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;

      if (!state.nodes[nodeId]) return;

      delete state.nodes[nodeId];

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

  async reopenNode(oldNodeID: string | number): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const oldNode = state.nodes[oldNodeID];

      if (!oldNode) return;

      const newTab = await chrome.tabs.create({ url: oldNode.url, active: true });
      if (!newTab.id) return;

      const newID = newTab.id;
      const updatedNodes = {
        ...state.nodes
      };

      const revivedNode: TabNode = {
        ...oldNode,
        id: newID,
        isClosed: false,
        isRemote: false,
        remoteAddedAt: undefined,
        windowID: newTab.windowId,
        favIconURL: newTab.favIconUrl || oldNode.favIconURL,
        title: newTab.title || oldNode.title
      };

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

  // Removes remote nodes older than the given age. Called once per boot.
  async sweepStaleRemoteNodes(maxAgeMs: number): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get("tabTreeData");
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      const now = Date.now();

      const stale = Object.entries(state.nodes)
        .filter(([, node]) => {
          if (!node.isRemote) return false;
          const addedAt = node.remoteAddedAt ?? 0;
          return addedAt > 0 && now - addedAt > maxAgeMs;
        })
        .map(([id]) => id);

      if (stale.length === 0) return;

      const staleIDs = new Set(stale);
      const updatedNodes: Record<string | number, TabNode> = {};
      Object.entries(state.nodes).forEach(([id, node]) => {
        if (staleIDs.has(id)) return;
        updatedNodes[id] = {
          ...node,
          childrenIDs: node.childrenIDs.filter((childID) => !staleIDs.has(String(childID))),
        };
      });

      const { nodes: sanitizedNodes, rootIDs: sanitizedRoots, groups } =
        sanitizeTree(updatedNodes);

      await chrome.storage.local.set({
        tabTreeData: {
          ...state,
          nodes: sanitizedNodes,
          rootIDs: sanitizedRoots,
          groups,
        },
      });
    });
  },

  async setActiveMediaTab(tabID: string | number | null): Promise<void> {
    await this.transaction((state) => ({
      activeMediaTabID: tabID,
    }));
  },

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
          notes: target.notes.filter((n) => n.id !== noteID),
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

  async addMoodboardItem(item: Omit<MoodboardItem, 'id' | 'createdAt'>): Promise<MoodboardItem> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get('tabTreeData');
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;

      const newItem: MoodboardItem = {
        ...item,
        id: `board_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        createdAt: Date.now(),
      };

      const updatedMoodboardItems = {
        ...(state.moodboardItems || {}),
        [newItem.id]: newItem,
      };

      await chrome.storage.local.set({
        tabTreeData: { ...state, moodboardItems: updatedMoodboardItems },
      });

      return newItem;
    });
  },

  async deleteMoodboardItem(itemID: string): Promise<void> {
    return enqueue(async () => {
      const data = await chrome.storage.local.get('tabTreeData');
      const state = (data.tabTreeData as TreeStorageSchema) || InitState;
      if (!state.moodboardItems?.[itemID]) return;

      const updatedMoodboardItems = { ...state.moodboardItems };
      delete updatedMoodboardItems[itemID];

      await chrome.storage.local.set({
        tabTreeData: { ...state, moodboardItems: updatedMoodboardItems },
      });
    });
  },

  async saveHotTabSet(set: HotTabSet): Promise<void> {
    await this.transaction((state) => ({
      hotTabs: {
        ...(state.hotTabs || {}),
        [set.id]: set,
      },
    }));
  },

  async deleteHotTabSet(setId: string): Promise<void> {
    await this.transaction((state) => {
      const hotTabs = { ...(state.hotTabs || {}) };
      delete hotTabs[setId];
      return { hotTabs };
    });
  },

  async getHotTabSets(): Promise<HotTabSet[]> {
    const state = await this.get();
    return Object.values(state.hotTabs || {});
  },

  async clearAll(): Promise<void> {
    return enqueue(async () => {
      await chrome.storage.local.remove('tabTreeData');
    });
  },
};