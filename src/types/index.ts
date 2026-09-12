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
    lastActiveTabID: number | null;
    activeMediaTabID: string | number | null;
    activeMediaAccentColor: string | null;
    // subscription status (preferibly use in another type for user)
    isPro: boolean;
}

// grouping, exporting
export interface Workspace {
    id: string;
    name: string;
    color?: string;
    isDefault?: boolean;
}


