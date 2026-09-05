export interface TabNode {
    id: number,
    title: string,
    url: string,
    parentID: number | null, 
    windowID: number,
    favIconURL?: string,
    isClosed: boolean,
    closedAt?: number,
    childrenIDs: number[]
}

// changes in state -> changes in:
export interface TreeStorageSchema{
    nodes: Record<number, TabNode>;
    rootIDs: number[];
    lastActiveTabID: number | null;
    // subscription status (preferibly use in another type for user)
    isPro: boolean;
}



