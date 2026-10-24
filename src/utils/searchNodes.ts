import { REMOTE_WORKSPACE_ID, type TabNode, type TabNote } from "../types";
import { htmlToPlainText } from "./noteText";

export type SearchMode = 'all' | 'tabs' | 'notes';
export type SearchScope = 'workspace' | 'all';
export type MatchField = 'title' | 'url' | 'notes';

export interface SearchOptions {
    mode: SearchMode;
    scope: SearchScope;
    workspaceID: string;
    includeClosed: boolean;
}

export interface SearchResult {
    nodeID: string | number;
    score: number;
    matchedIn: MatchField[];
    snippet?: string;
}

const MAX_RESULTS = 50;
const NON_WORD = /[^\p{L}\p{N}]/u;
const noteTextCache = new Map<string, { text: string; lower: string }>();

function getNoteText(note: TabNote) {
    let cached = noteTextCache.get(note.id);
    if (!cached) {
        const text = htmlToPlainText(note.content);
        cached = { text, lower: text.toLowerCase() };
        noteTextCache.set(note.id, cached);
    }
    return cached;
}

function isWordStart(text: string, index: number): boolean {
    return index === 0 || NON_WORD.test(text.charAt(index - 1));
}

function isInScope(node: TabNode, scope: SearchScope, workspaceID: string): boolean {
    if (scope === 'all') return true;
    if (workspaceID === REMOTE_WORKSPACE_ID) return !!node.isRemote;
    return (node.workspaceID || 'workspace-default') === workspaceID;
}

function findSnippet(notes: { text: string; lower: string }[], token: string): string | null {
    for (const { text, lower } of notes) {
        const index = lower.indexOf(token);
        if (index === -1) continue;
        const start = Math.max(0, index - 30);
        const end = Math.min(text.length, index + token.length + 60);
        return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
    }
    return null;
}

export function searchNodes(
    nodes: Record<string | number, TabNode>,
    query: string,
    options: SearchOptions
): SearchResult[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const { mode, scope, workspaceID, includeClosed } = options;
    const searchTabs = mode !== 'notes';
    const searchNotes = mode !== 'tabs';
    const results: SearchResult[] = [];

    for (const node of Object.values(nodes)) {
        if (node.isHistoryNode || (!includeClosed && node.isClosed) || !isInScope(node, scope, workspaceID)) continue;

        const title = (node.title || '').toLowerCase();
        const url = (node.url || '').toLowerCase();
        const notes = searchNotes ? (node.notes ?? []).map(getNoteText) : [];
        let score = 0;
        let snippet: string | undefined;
        let matchesEveryToken = true;
        const matchedIn = new Set<MatchField>();

        for (const token of tokens) {
            let tokenScore = 0;
            if (searchTabs) {
                const titleIndex = title.indexOf(token);
                if (titleIndex !== -1) {
                    tokenScore += 3 + (isWordStart(title, titleIndex) ? 2 : 0);
                    matchedIn.add('title');
                }
                if (url.includes(token)) {
                    tokenScore += 2;
                    matchedIn.add('url');
                }
            }
            if (searchNotes) {
                const found = findSnippet(notes, token);
                if (found) {
                    tokenScore += 1;
                    matchedIn.add('notes');
                    snippet ??= found;
                }
            }
            if (tokenScore === 0) {
                matchesEveryToken = false;
                break;
            }
            score += tokenScore;
        }

        if (matchesEveryToken) results.push({ nodeID: node.id, score, matchedIn: Array.from(matchedIn), snippet });
    }

    results.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const nodeA = nodes[a.nodeID]!;
        const nodeB = nodes[b.nodeID]!;
        if (nodeA.isClosed !== nodeB.isClosed) return nodeA.isClosed ? 1 : -1;
        return (nodeB.closedAt ?? 0) - (nodeA.closedAt ?? 0);
    });
    return results.slice(0, MAX_RESULTS);
}

export function getBreadcrumb(
    nodeID: string | number,
    nodes: Record<string | number, TabNode>,
    maxDepth = 3
): string[] {
    const trail: string[] = [];
    const seen = new Set<string | number>([nodeID]);
    let currentID: string | number | null | undefined = nodes[nodeID]?.parentID;
    while (currentID !== null && currentID !== undefined && !seen.has(currentID) && trail.length < maxDepth) {
        const parent = nodes[currentID];
        if (!parent) break;
        seen.add(currentID);
        trail.unshift(parent.title || 'New Tab');
        currentID = parent.parentID;
    }
    return trail;
}
