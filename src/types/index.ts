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
    source?: Source;
    // grouping
    workspaceID: string;

    // Marks a node that arrived via sync and is displayed in the Cloud section
    // until the user launches it. Purely local UI state — never synced.
    isRemote?: boolean;

    // When the node was first received as remote. Used for the 7-day TTL sweep.
    // Purely local UI state — never synced.
    remoteAddedAt?: number;
}

export const REMOTE_WORKSPACE_ID = 'workspace-remote';

// for per tab notes
export interface TabNote {
    id: string;
    content: string;
    createdAt: number;
    sourceURL?: string;
}

export type SourceType =
    | 'article'
    | 'conference'
    | 'thesis'
    | 'report'
    | 'book'
    | 'preprint'
    | 'webpage';

export interface Source {
    type: SourceType;
    title: string;
    authors: string[];
    year: string;
    month: string;
    journal: string;
    conference: string;
    address: string;
    publisher: string;
    institution: string;
    volume: string;
    issue: string;
    pages: string;
    doi: string;
    arxiv: string;
    site: string;
    url: string;
    accessed: string;
    citeKey: string;
    userEdited: string[];
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
    // subscription status
    // isPro moved to top-level storage for consistency
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
    favIconUrl?: string;
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
    baseUpdatedAt?: number;
    activeWorkspaceID: string;
    workspaces: Workspace[];
    nodes: Record<string | number, TabNode>;
    rootIDs: (string | number)[];
    groups: Record<string, TabGroup>;
    moodboardItems?: Record<string, MoodboardItem>;
    hotTabs?: Record<string, HotTabSet>;
}
