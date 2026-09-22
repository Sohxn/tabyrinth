import { type TabNode, type TreeStorageSchema } from "../types";
import TurnDownService from "turndown";

// todo: check for preformatted code once
const turndownservice = new TurnDownService({ headingStyle: "atx", codeBlockStyle: "fenced" })

// rules for markdown
turndownservice.addRule('sup', {
    filter: 'sup',
    replacement: function (content) {
        return `<sup>${content}</sup>`
    }
});

//**helpers */
function noteHTML2Markdown(html: string): string {
    if (!html) return '';
    try {
        return turndownservice.turndown(html)
            .replace(/\\\[/g, '[')
            .replace(/\\\]/g, ']')
            .trim();
    } catch {
        return html;
    }
}

function collectTabsWithNotes(
    nodes: Record<string | number, TabNode>,
    rootIDs: (string | number)[]): TabNode[] {

    const res: TabNode[] = [];
    const visit = (id: string | number) => {
        const node = nodes[id];
        if (!node) return;
        if (node.notes && node.notes.length > 0) res.push(node);
        (node.childrenIDs || []).forEach(visit);
    };
    rootIDs.forEach(visit);
    return res;
}

function renderTabSection(node: TabNode): string {
    const lines: string[] = [];
    lines.push(`### ${node.title || 'Untitled tab'}`);
    lines.push(node.url);
    lines.push('');
    (node.notes || []).forEach((note) => {
        const md = noteHTML2Markdown(note.content);
        if (md) {
            lines.push(md);
            lines.push('');
        }
    });
    return lines.join('\n');
}

//** main export */
export function buildMarkdownExport(
    schema: TreeStorageSchema,
    scope: { workspaceID?: string } = {}
): string {
    const { nodes, rootIDs, workspaces } = schema;
    const out: string[] = [];

    const tabsForWorkspace = (wsID: string): TabNode[] => {
        const wsRootIDs = rootIDs.filter((id) => {
            const n = nodes[id];
            return n && (n.workspaceID || 'workspace-default') === wsID;
        });

        return collectTabsWithNotes(nodes, wsRootIDs);
    };

    if (scope.workspaceID) {
        const ws = (workspaces || []).find((w) => w.id === scope.workspaceID);
        out.push(`# ${ws?.name || 'Workspace'} — Notes Export`);
        out.push('');
        const tabsWithNotes = tabsForWorkspace(scope.workspaceID);
        if (tabsWithNotes.length === 0) {
            out.push('_No notes in this workspace._');
        } else {
            tabsWithNotes.forEach((n) => out.push(renderTabSection(n)));
        }
    } else {
        out.push('# All Workspaces — Notes Export');
        out.push('');
        const wsList = workspaces && workspaces.length > 0
            ? workspaces
            : [{ id: 'workspace-default', name: 'untitled' }];

        let anyNotes = false;
        wsList.forEach((ws) => {
            const tabsWithNotes = tabsForWorkspace(ws.id);
            // if the workspace is empty skip it
            if (tabsWithNotes.length === 0) return;
            anyNotes = true;
            out.push(`## ${ws.name}`);
            out.push('');
            tabsWithNotes.forEach((n) => out.push(renderTabSection(n)));
        });

        if (!anyNotes) out.push('_No notes anywhere yet._');
    }

    return out.join('\n');
};

export function downloadMarkdown(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


