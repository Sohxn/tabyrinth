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

// moodboarding / planning
export interface MoodboardItem {
    id: string,
    type: 'image' | 'note';
    content: string,
    sourceURL?: string,
    sourceTitle?: string,
    workspaceID: string,
    createdAt: number;
    isEmbedded?: boolean;
    aspectRatio?: number;
    linkedTo?: string;
    linkRole?: 'caption' | 'annotation';
}

export interface MoodboardUnit {
    primary: MoodboardItem;
    linked: MoodboardItem[];
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
    moodboardItems?: Record<string, MoodboardItem>;
    // board visibility
    moodboardVisible?: boolean;
    hotTabs?: Record<string, HotTabSet>;
}

// grouping, exporting
export interface Workspace {
    id: string;
    name: string;
    color?: string;
    isDefault?: boolean;
}

export interface HotTabItem {
    url: string;
    title: string;
}

export interface HotTabSet {
    id: string;
    name: string;
    items: HotTabItem[];
    createdAt: number;
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
