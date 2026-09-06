import {create} from 'zustand';
import { StorageService } from '../services/storage';
import { type TabNode, type TreeStorageSchema } from '../types';

interface TreeStoreState {
    nodes: Record<string | number, TabNode>;
    rootIDs: (string | number)[];
    lastActiveTabID: number | null;
    isPro: boolean;
    expandedNodeIDs: Record<string | number, boolean>;
    searchQuery: string;

    init: () => Promise<void>;
    syncFromStorage: (schema: TreeStorageSchema) => void;
    toggleExpand: (nodeID:string | number) => void;
    setSearchQuery: (query: string) => void;
    focusTab: (tabID: string | number) => Promise<void>;
    closeTab: (tabID: string | number) => Promise<void>;
}

export const useTreeStore = create<TreeStoreState>()((set, get) => ({
    nodes: {},
    rootIDs: [],
    lastActiveTabID: null,
    isPro: false,
    expandedNodeIDs: {},
    searchQuery: '',

    init: async() => {
        const data = await StorageService.get();
        get().syncFromStorage(data);
    },

    syncFromStorage: (schema) => {
        set((state) => {
            // auto expand newly discovered parent nodes
            const nextExpanded = {...state.expandedNodeIDs};
            Object.values(schema.nodes).forEach((node) => {
                if(node.childrenIDs.length > 0 && nextExpanded[node.id] === undefined){
                    nextExpanded[node.id] = true;
                }
            });

            return {
                nodes: schema.nodes,
                rootIDs: schema.rootIDs,
                lastActiveTabID: schema.lastActiveTabID,
                isPro: schema.isPro,
                expandedNodeIDs: nextExpanded,
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

    setSearchQuery: (query) => {
        set({
            searchQuery: query
        })
    },

    // switch tabs according to where the user clicks on the sidepanel
    focusTab: async(tabID) =>  {
        const node = get().nodes[tabID];
        if(!node || node.isClosed || typeof(tabID) == 'string') return;

        try{
            await chrome.tabs.update(tabID, {active: true});
            await chrome.windows.update(node.windowID, {focused: true});
        } catch(err) {
            console.error('[LOG] Failed to focus tab: ', err);
        }
    },

    closeTab: async(tabID) => {
        const numericID = typeof tabID === 'number' ? tabID : parseInt(tabID, 10);
        if(isNaN(numericID)){
            await StorageService.markNodeClosed(tabID);
            return;
        }
        
        try{
            await chrome.tabs.remove(numericID);
        }catch(err){
            console.error("[LOG] failed to close tab: ", err);
            await StorageService.markNodeClosed(tabID);
        }
    }
}));