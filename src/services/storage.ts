import { type TreeStorageSchema, type TabNode } from "../types";

//     nodes: Record<number, TabNode>;
//     rootIDs: number[];
//     lastActiveTabID: number | null;
//     isPro: boolean;

const InitState: TreeStorageSchema = {
    nodes: {},
    rootIDs: [],
    lastActiveTabID: null,
    isPro: false
};

export const StorageService = {
    async get(): Promise<TreeStorageSchema> {
        const data = await chrome.storage.local.get('tabTreeData');
        return (data.tabTreeData as TreeStorageSchema) || InitState;
    },

    async set(patch: Partial<TreeStorageSchema>): Promise<void> {
        const current = await this.get();
        await chrome.storage.local.set({
            tabTreeData: {...current, ...patch},
        });
    },

    async upsertNode(node: TabNode): Promise<void> {
        const state = await this.get();
        const updatedNodes = {...state.nodes, [node.id]: node};
        const updatedRoots = [...state.rootIDs];

        const parent = node.parentID != null ? updatedNodes[node.parentID] : undefined;

        if(parent){
            if(!parent.childrenIDs.includes(node.id)){
                updatedNodes[parent.id] = {
                    ...parent, 
                    childrenIDs: [...parent.childrenIDs, node.id],
                }
            }
        }
        else if(!node.parentID && !updatedRoots.includes(node.id)){
            updatedRoots.push(node.id);
        }
        await this.set({
            nodes: updatedNodes, 
            rootIDs: updatedRoots

        });
    },

    async markNodeClosed(tabID: number): Promise<void> {
        const state = await this.get();
        const target = state.nodes[tabID];
        if(!target) return;

        const updatedNodes = {
            ...state.nodes,
            [tabID]: {
                ...target,
                isClosed: true,
                closedAt: Date.now()
            }
        };

        await this.set({
            nodes: updatedNodes
        });
    }
};
