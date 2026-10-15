import { type TabNode, type TreeStorageSchema } from "../types";
import { noteHTML2Markdown, downloadMarkdown } from "./exportNotes";

const INDENT = "  ";

// Sibling order follows childrenIDs insertion order and may drift after tree edits.
function renderNode(
    nodeID: string | number,
    nodes: Record<string | number, TabNode>,
    depth: number
): string {
    const node = nodes[nodeID];
    if (!node || node.isRemote) return "";

    const indent = INDENT.repeat(depth);
    const tags: string[] = [];
    if (node.isClosed) tags.push("`closed`");
    if (node.isHistoryNode) tags.push("`history`");

    const title = node.title || "Untitled";
    const link = node.url ? `[${title}](${node.url})` : title;
    const tagSuffix = tags.length > 0 ? ` ${tags.join(" ")}` : "";
    const cite = node.source?.citeKey ? ` \`[${node.source.citeKey}]\`` : "";
    const lines: string[] = [`${indent}- ${link}${tagSuffix}${cite}`];

    (node.notes ?? []).forEach((note) => {
        const markdown = noteHTML2Markdown(note.content);
        if (!markdown) return;
        lines.push(
            markdown
                .split("\n")
                .map((line) => `${indent}  > ${line}`)
                .join("\n")
        );
    });

    (node.childrenIDs ?? []).forEach((childID) => {
        const rendered = renderNode(childID, nodes, depth + 1);
        if (rendered) lines.push(rendered);
    });

    return lines.join("\n");
}

function collectWorkspaceRoots(
    schema: TreeStorageSchema,
    workspaceID: string
): (string | number)[] {
    return (schema.rootIDs ?? []).filter((id) => {
        const node = schema.nodes[id];
        if (!node || node.isRemote) return false;
        return (node.workspaceID || "workspace-default") === workspaceID;
    });
}

function renderWorkspaceSection(
    schema: TreeStorageSchema,
    workspaceID: string,
    workspaceName: string
): string {
    const roots = collectWorkspaceRoots(schema, workspaceID);
    if (roots.length === 0) return "";

    const output = [`## ${workspaceName}`, ""];
    roots.forEach((rootID) => {
        const rendered = renderNode(rootID, schema.nodes, 0);
        if (rendered) {
            output.push(rendered);
            output.push("");
        }
    });
    return output.join("\n");
}

function countNodes(
    nodes: Record<string | number, TabNode>,
    workspaceID?: string
): number {
    return Object.values(nodes).filter((node) => {
        if (node.isRemote) return false;
        if (!workspaceID) return true;
        return (node.workspaceID || "workspace-default") === workspaceID;
    }).length;
}

export function buildTrailExport(
    schema: TreeStorageSchema,
    scope: { workspaceID?: string } = {}
): string {
    const { workspaces, nodes } = schema;
    const output: string[] = [];
    const exportedAt = new Date().toISOString().slice(0, 10);

    if (scope.workspaceID) {
        const workspace = (workspaces || []).find((item) => item.id === scope.workspaceID);
        const workspaceName = workspace?.name || "Workspace";

        output.push(`# Research Trail — ${workspaceName}`);
        output.push("");
        output.push(`_Exported: ${exportedAt}_`);
        output.push(`_Tabs: ${countNodes(nodes, scope.workspaceID)}_`);
        output.push("");
        output.push("---");
        output.push("");

        const section = renderWorkspaceSection(schema, scope.workspaceID, workspaceName);
        if (!section) {
            output.push("_No tabs in this workspace._");
        } else {
            output.push(section.split("\n").slice(2).join("\n").trimEnd());
        }
    } else {
        output.push("# Research Trail — All Workspaces");
        output.push("");
        output.push(`_Exported: ${exportedAt}_`);
        output.push(`_Tabs: ${countNodes(nodes)}_`);
        output.push("");

        const workspaceList = workspaces && workspaces.length > 0
            ? workspaces
            : [{ id: "workspace-default", name: "untitled" }];
        let anySection = false;

        workspaceList.forEach((workspace) => {
            const section = renderWorkspaceSection(schema, workspace.id, workspace.name);
            if (!section) return;
            anySection = true;
            output.push("");
            output.push("---");
            output.push("");
            output.push(section.trimEnd());
        });

        if (!anySection) {
            output.push("");
            output.push("_No tabs anywhere yet._");
        }
    }

    return `${output.join("\n")}\n`;
}

export function downloadTrail(content: string, filename: string): void {
    downloadMarkdown(content, filename);
}
