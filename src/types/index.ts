//*added: groups
//***note: for groups id like to have an uplifted blob like 
//***note: the craftzdog vid
export type GroupType = 'chain' | 'ghost';

export interface TabGroup {
    id: string;
    type: GroupType;
    workspaceID: string;
    rootID?: string | number;
    nodeIDs: (string | number)[];
}

export interface TabNode {
    id: string | number;
    title: string;
    url: string;
    parentID: string | number | null;
    windowID: number;
    favIconURL?: string;
    isHistoryNode?: boolean;
    childrenIDs: (string | number)[];
    // states
    isLoading: boolean;
    isClosed: boolean;
    closedAt?: number;
    // util
    notes?: TabNote[];
    // grouping
    workspaceID: string;
}

// for per tab notes
export interface TabNote {
    id: string;
    content: string;
    createdAt: number;
    sourceURL?: string;
}

// changes in state -> changes in:
export interface TreeStorageSchema {
    nodes: Record<string | number, TabNode>;
    rootIDs: (string | number)[];
    groups: Record<string, TabGroup>;
    lastActiveTabID: number | null;
    activeMediaTabID: string | number | null;
    activeMediaAccentColor: string | null;
    // subscription status (preferibly use in another type for user)
    isPro: boolean;
    // workspace persistence
    lastSyncedAt?: number;
    activeWorkspaceID: string;
    workspaces?: Workspace[];
}

// grouping, exporting
export interface Workspace {
    id: string;
    name: string;
    color?: string;
    isDefault?: boolean;
}

// sync
export interface SyncPayload {
    updatedAt: number;
    activeWorkspaceID: string;
    workspaces: Workspace[];
    nodes: Record<string | number, TabNode>;
    rootIDs: (string | number)[];
    groups: Record<string, TabGroup>;
}

