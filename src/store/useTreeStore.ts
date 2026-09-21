import { create } from 'zustand';
import { StorageService } from '../services/storage';
import { type TabNode, type TreeStorageSchema, type Workspace, type TabGroup } from '../types';

const DEFAULT_WORKSPACE: Workspace = {
    id: 'workspace-default',
    name: 'untitled',
    isDefault: true
};

interface TreeStoreState {
    workspaces: Workspace[];
    activeWorkspaceID: string;

    nodes: Record<string | number, TabNode>;
    rootIDs: (string | number)[];
    lastActiveTabID: number | null;
    isPro: boolean;
    expandedNodeIDs: Record<string | number, boolean>;
    expandedStackIDs: Record<string | number, boolean>;
    searchQuery: string;

    // grouping
    groups: Record<string, TabGroup>;

    // secondary
    activeMediaTabID: string | number | null;

    init: () => Promise<void>;

    //testing the editor
    syncFromStorage: (schema: TreeStorageSchema) => void;
    toggleExpand: (nodeID: string | number) => void;
    toggleStackExpand: (nodeID: string | number) => void;
    setSearchQuery: (query: string) => void;
    focusTab: (tabID: string | number) => Promise<void>;
    closeTab: (tabID: string | number) => Promise<void>;
    setActiveMediaTabID: (nodeID: string | number | null) => void;
    focusMediaTab: () => Promise<void>;

    //workspace
    createWorkspace: (name: string) => string;
    renameWorkspace: (WorkspaceID: string, name: string) => void;
    assignTabToWorkspace: (nodeID: string, workspaceID: string) => void;
    getTabsByWorkspace: (workspaceID: string) => (string | number)[];
    setActiveWorkspace: (workspaceID: string) => Promise<void>;
    //grouping
    getRegularRootIDs: (WorkspaceID: string) => (string | number)[];
    getGhostGroup: (workspaceID: string) => TabGroup | null;
}

export const useTreeStore = create<TreeStoreState>()((set, get) => ({
    workspaces: [DEFAULT_WORKSPACE],
    activeWorkspaceID: DEFAULT_WORKSPACE.id,

    nodes: {},
    rootIDs: [],
    groups: {},
    lastActiveTabID: null,
    isPro: false,
    expandedNodeIDs: {},
    expandedStackIDs: {},
    searchQuery: '',
    activeMediaTabID: null,

    init: async () => {
        const data = await StorageService.get();
        get().syncFromStorage(data);
    },

    syncFromStorage: (schema) => {
        set((state) => {
            // auto expand newly discovered parent nodes
            const nextExpanded = { ...state.expandedNodeIDs };
            // added a safe fallback with {}
            Object.values(schema.nodes || {}).forEach((node) => {
                if (node.childrenIDs.length > 0 && nextExpanded[node.id] === undefined) {
                    nextExpanded[node.id] = true;
                }
            });

            return {
                nodes: schema.nodes,
                rootIDs: schema.rootIDs,
                lastActiveTabID: schema.lastActiveTabID,
                isPro: schema.isPro,
                expandedNodeIDs: nextExpanded,
                activeMediaTabID: schema.activeMediaTabID ?? null,
                workspaces: schema.workspaces && schema.workspaces.length > 0 ? schema.workspaces : state.workspaces,
                activeWorkspaceID: schema.activeWorkspaceID || state.activeWorkspaceID,
                groups: schema.groups || {}
            }
        })
    },

    toggleExpand: (nodeID) => {
        set((state) => ({
            expandedNodeIDs: {
                ...state.expandedNodeIDs,
                [nodeID]: !state.expandedNodeIDs[nodeID],
            },
        }));
    },

    toggleStackExpand: (nodeID) => {
        set((state) => ({
            expandedStackIDs: {
                ...state.expandedStackIDs,
                [nodeID]: !state.expandedStackIDs[nodeID],
            },
        }));
    },

    setSearchQuery: (query) => {
        set({
            searchQuery: query
        })
    },

    // switch tabs according to where the user clicks on the sidepanel
    focusTab: async (tabID) => {
        const node = get().nodes[tabID];
        if (!node || node.isClosed || typeof (tabID) == 'string') return;

        try {
            await chrome.tabs.update(tabID, { active: true });
            await chrome.windows.update(node.windowID, { focused: true });
        } catch (err) {
            console.error('[LOG] Failed to focus tab: ', err);
        }
    },

    closeTab: async (tabID) => {
        const numericID = typeof tabID === 'number' ? tabID : parseInt(tabID, 10);
        if (isNaN(numericID)) {
            await StorageService.markNodeClosed(tabID);
            return;
        }

        try {
            await chrome.tabs.remove(numericID);
        } catch (err) {
            console.error("[LOG] failed to close tab: ", err);
            await StorageService.markNodeClosed(tabID);
        }
    },

    focusMediaTab: async () => {
        const mediaID = get().activeMediaTabID;
        if (mediaID !== null) {
            await get().focusTab(mediaID);
        }
    },

    setActiveMediaTabID: (nodeID) => {
        set({ activeMediaTabID: nodeID });
    },

    createWorkspace: (name: string) => {
        const newspace: Workspace = {
            id: `workspace-${Date.now()}`,
            name: name.trim() || `untitled-${Date.now()}`,
        };

        const updatedWorkspaces = [
            ...get().workspaces,
            newspace
        ];

        set((state) => ({
            workspaces: [
                ...state.workspaces,
                newspace
            ],
        }));

        StorageService.set({
            workspaces: updatedWorkspaces
        });

        return newspace.id;
    },

    renameWorkspace: (workspaceID: string, name: string) => {
        const trimmed = name.trim();
        if (!trimmed) return;

        set((state) => {
            const updatedWorkspaces = state.workspaces.map((w) =>
                w.id === workspaceID ? {
                    ...w,
                    name: trimmed
                } : w
            );

            StorageService.set({
                workspaces: updatedWorkspaces
            });

            return {
                workspaces: updatedWorkspaces
            };
        });
    },

    assignTabToWorkspace: (nodeID: string, workspaceID: string) => {
        set((state) => {
            const targetTab = state.nodes[nodeID];
            if (!targetTab) return state;

            const updatedNodes = {
                ...state.nodes,
                [nodeID]: {
                    ...targetTab,
                    workspaceID
                }
            }

            StorageService.set({
                nodes: updatedNodes
            });

            return {
                nodes: updatedNodes
            }
        });
    },

    getTabsByWorkspace: (workspaceID: string) => {
        const { rootIDs, nodes } = get();
        return rootIDs.filter((id) => {
            const node = nodes[id];
            if (!node) return false;

            const tabWorkspace = node.workspaceID || DEFAULT_WORKSPACE.id;
            return tabWorkspace === workspaceID;
        });
    },

    getRegularRootIDs: (workspaceID: string) => {
        const { rootIDs, nodes, groups } = get();
        const ghostGroup = groups[`ghost_${workspaceID}`];
        const ghostRootIDs = new Set(ghostGroup?.nodeIDs ?? []);
        return rootIDs.filter((id) => {
            const node = nodes[id];
            if (!node) return false;
            const wsID = node.workspaceID || DEFAULT_WORKSPACE.id;
            if (wsID !== workspaceID) return false;
            return !ghostRootIDs.has(id);
        });
    },

    getGhostGroup: (WorkspaceID: string) => {
        return get().groups[`ghost_${WorkspaceID}`] ?? null;
    },

    setActiveWorkspace: async (workspaceID: string) => {
        set({
            activeWorkspaceID: workspaceID
        });
        await StorageService.set({
            activeWorkspaceID: workspaceID
        })
    }
}));
