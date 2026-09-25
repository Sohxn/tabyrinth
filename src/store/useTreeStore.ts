import { create } from 'zustand';
import { StorageService } from '../services/storage';
import { type TabNode, type TreeStorageSchema, type Workspace, type TabGroup, type MoodboardItem, type MoodboardUnit } from '../types';

export const CHAIN_FOLD_THRESHOLD = 4;

// mirror function
function getChainLengthFrom(startID: string | number, nodes: Record<string | number, TabNode>): number {
    let len = 0;
    let currID: string | number | undefined = startID;

    while (currID !== undefined) {
        const currNode: TabNode | undefined = nodes[currID];
        if (!currNode) break;
        len++;
        currID = currNode.childrenIDs.length === 1 ? currNode.childrenIDs[0] : undefined;
    }

    return len;
}

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

    // moodboarding and ideation
    moodboardItems: Record<string, MoodboardItem>;
    //board visibility
    moodboardVisible: boolean

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

    //moodboarding and ideation
    getMoodboardItemsByWorkspace: (workspaceID: string) => MoodboardItem[];
    deleteMoodboardItem: (itemID: string) => void;
    linkMoodboardItem: (childID: string, parentID: string, role: 'caption' | 'annotation') => void;
    unlinkMoodboardItem: (itemID: string) => void;
    getMoodboardUnits: (workspaceID: string) => MoodboardUnit[];
    setItemAspectRatio: (itemID: string, ratio: number) => void;
    toggleMoodboardVisibility: () => Promise<void>;
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
    moodboardItems: {},
    moodboardVisible: false,

    init: async () => {
        const data = await StorageService.get();
        get().syncFromStorage(data);
    },

    syncFromStorage: (schema) => {
        set((state) => {
            const nextExpanded = { ...state.expandedNodeIDs };
            Object.values(schema.nodes || {}).forEach((node) => {
                const isChainFoldCandidate = getChainLengthFrom(node.id, schema.nodes) > CHAIN_FOLD_THRESHOLD;
                if (node.childrenIDs.length > 0 && nextExpanded[node.id] === undefined && !isChainFoldCandidate) {
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
                groups: schema.groups || {},
                moodboardItems: schema.moodboardItems || {},
                moodboardVisible: schema.moodboardVisible || false
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
    },

    getMoodboardItemsByWorkspace: (workspaceID: string) => {
        const { moodboardItems } = get();
        return Object.values(moodboardItems).filter((i) => i.workspaceID === workspaceID);
    },

    linkMoodboardItem: (childID: string, parentID: string, role: 'caption' | 'annotation' = 'caption') => {
        set((state) => {
            const child = state.moodboardItems[childID];
            const parent = state.moodboardItems[parentID];
            if (!child || !parent || childID === parentID) return state;
            if (parent.linkedTo) return state;

            const updated = {
                ...state.moodboardItems,
                [childID]: {
                    ...child,
                    linkedTo: parentID,
                    linkRole: role
                }
            };
            StorageService.set({
                moodboardItems: updated
            });
            return {
                moodboardItems: updated
            }
        });
    },

    unlinkMoodboardItem: (itemID: string) => {
        set((state) => {
            const item = state.moodboardItems[itemID];
            if (!item?.linkedTo) return state;
            const { linkedTo, linkRole, ...rest } = item;
            const updated = { ...state.moodboardItems, [itemID]: rest };
            StorageService.set({ moodboardItems: updated });
            return { moodboardItems: updated };
        });
    },

    deleteMoodboardItem: (itemID: string) => {
        set((state) => {
            const updated = { ...state.moodboardItems };
            delete updated[itemID];
            Object.values(updated).forEach((i) => {
                if (i.linkedTo === itemID) delete updated[i.id];
            });
            StorageService.set({ moodboardItems: updated });
            return { moodboardItems: updated };
        });
    },

    getMoodboardUnits: (workspaceID: string) => {
        const items = get().getMoodboardItemsByWorkspace(workspaceID);
        const linkedByParent: Record<string, MoodboardItem[]> = {};
        items.forEach((i) => {
            if (i.linkedTo) (linkedByParent[i.linkedTo] ??= []).push(i);
        });
        return items
            .filter((i) => !i.linkedTo)
            .map((primary) => ({ primary, linked: linkedByParent[primary.id] ?? [] }));
    },

    setItemAspectRatio: (itemID: string, ratio: number) => {
        set((state) => {
            const item = state.moodboardItems[itemID];
            if (!item || item.aspectRatio) return state;
            const updated = {
                ...state.moodboardItems,
                [itemID]: {
                    ...item,
                    aspectRatio: ratio
                }
            };
            StorageService.set({
                moodboardItems: updated
            });
            return {
                moodboardItems: updated
            };
        });
    },

    toggleMoodboardVisibility: async () => {
        const next = !get().moodboardVisible;
        set({ moodboardVisible: next });
        await StorageService.set({ moodboardVisible: next });
    }
}));
