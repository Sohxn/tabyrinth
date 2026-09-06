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

// mutex queue to handle race conditions
let storageQueue: Promise<any> = Promise.resolve();
const  enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
        storageQueue = storageQueue.then(task).then(resolve).catch(reject);
    });
};

export const StorageService = {
    async get(): Promise<TreeStorageSchema> {
        const data = await chrome.storage.local.get('tabTreeData');
        return (data.tabTreeData as TreeStorageSchema) || InitState;
    },

    async set(patch: Partial<TreeStorageSchema>): Promise<void> {
        return enqueue(async () => {
            const data = await chrome.storage.local.get('tabTreeData');
            const current = (data.tabTreeData as TreeStorageSchema) || InitState;
            await chrome.storage.local.set({
                tabTreeData: {...current, ...patch},
            });
        });
    },

    async upsertNode(node: TabNode): Promise<void> {
        return enqueue(async () => {
            const data = await chrome.storage.local.get("tabTreeData");
            const state = (data.tabTreeData as TreeStorageSchema) || InitState;
            const updatedNodes = { ...state.nodes, [node.id]: node };
            const updatedRoots = [...state.rootIDs];
            const parent = node.parentID != null ? updatedNodes[node.parentID] : undefined;

            if (parent) {
                if (!parent.childrenIDs.includes(node.id)) {
                    updatedNodes[parent.id] = {
                        ...parent,
                        childrenIDs: [...parent.childrenIDs, node.id],
                    };
                }
            } else if (!node.parentID && !updatedRoots.includes(node.id)) {
                updatedRoots.push(node.id);
            }

            await chrome.storage.local.set({
                tabTreeData: { ...state, nodes: updatedNodes, rootIDs: updatedRoots },
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

            await chrome.storage.local.set({
                tabTreeData: { ...state, nodes: updatedNodes },
            });
        });
    }
};
