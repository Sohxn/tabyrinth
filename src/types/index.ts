export interface TabNode {
    id: string | number;
    title: string;
    url: string;
    parentID: string | number | null; 
    windowID: number;
    favIconURL?: string;
    isClosed: boolean;
    closedAt?: number;
    isHistoryNode?: boolean;
    childrenIDs: (string | number)[];
}

// changes in state -> changes in:
export interface TreeStorageSchema{
    nodes: Record<string | number, TabNode>;
    rootIDs: (string | number)[];
    lastActiveTabID: number | null;
    // subscription status (preferibly use in another type for user)
    isPro: boolean;
}



