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

    // util
    notes?: TabNote[];

}

// for per tab notes
export interface TabNote {
    id: string;
    content: string;
    createdAt: number;
    sourceURL?: string;
}

// changes in state -> changes in:
export interface TreeStorageSchema{
    nodes: Record<string | number, TabNode>;
    rootIDs: (string | number)[];
    lastActiveTabID: number | null;
    activeMediaTabID: string | number | null;
    // subscription status (preferibly use in another type for user)
    isPro: boolean;
}



