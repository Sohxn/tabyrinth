import { type TreeStorageSchema, type MoodboardItem, type MoodboardUnit } from "../types";
import { noteHTML2Markdown, downloadMarkdown } from "./exportNotes";

function getMoodboardUnits(
    items: Record<string, MoodboardItem>,
    workspaceID: string
): MoodboardUnit[] {
    const workspaceItems = Object.values(items).filter((item) => item.workspaceID === workspaceID);
    const primaries = workspaceItems.filter((item) => !item.linkedTo);
    return primaries.map((primary) => ({
        primary,
        linked: workspaceItems.filter((item) => item.linkedTo === primary.id),
    }));
}

function renderUnit(unit: MoodboardUnit, index: number): string {
    const lines: string[] = [];
    const primary = unit.primary;
    const title = primary.sourceTitle || (primary.type === "image" ? "Image" : "Note");

    lines.push(`### ${index + 1}. ${title}`);

    if (primary.type === "image") {
        lines.push(`![${title}](${primary.content})`);
    } else {
        const md = noteHTML2Markdown(primary.content);
        if (md) lines.push(md);
    }

    if (primary.sourceURL) lines.push(`Source: ${primary.sourceURL}`);

    unit.linked.forEach((caption) => {
        const captionMd = noteHTML2Markdown(caption.content);
        if (captionMd) lines.push(`- ${captionMd}`);
    });

    lines.push("");
    return lines.join("\n");
}

export function buildMoodboardExport(
    schema: TreeStorageSchema,
    scope: { workspaceID?: string } = {}
): string {
    const { moodboardItems, workspaces } = schema;
    const out: string[] = [];
    const items = moodboardItems || {};

    const unitsForWorkspace = (wsID: string) => getMoodboardUnits(items, wsID);

    if (scope.workspaceID) {
        const ws = (workspaces || []).find((w) => w.id === scope.workspaceID);
        out.push(`# ${ws?.name || 'Workspace'} — Moodboard Export`);
        out.push('');

        const units = unitsForWorkspace(scope.workspaceID);
        if (units.length === 0) {
            out.push('_No items in this moodboard._');
        } else {
            units.forEach((unit, i) => out.push(renderUnit(unit, i)));
        }
    } else {
        out.push('# All Workspaces — Moodboard Export');
        out.push('');

        const wsList = workspaces && workspaces.length > 0
            ? workspaces
            : [{ id: 'workspace-default', name: 'untitled' }];

        let anyItems = false;
        wsList.forEach((ws) => {
            const units = unitsForWorkspace(ws.id);
            if (units.length === 0) return;
            anyItems = true;
            out.push(`## ${ws.name}`);
            out.push('');
            units.forEach((unit, i) => out.push(renderUnit(unit, i)));
        });

        if (!anyItems) out.push('_No moodboard items anywhere yet._');
    }

    return out.join('\n');
}

export function downloadMoodboard(content: string, filename: string): void {
    downloadMarkdown(content, filename);
}
