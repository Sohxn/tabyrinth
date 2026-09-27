import { type TreeStorageSchema } from "../types";
import { buildMarkdownExport } from "./exportNotes";
import { buildMoodboardExport } from "./exportMoodboard";
import { marked } from "marked";
import PRINT_STYLES from "./pdfExport.css?raw";

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// **todo: put this in a template file
function wrapHtmlDocument(title: string, bodyContent: string): string {
    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${PRINT_STYLES}</style>
</head>
<body>
<article class="markdown-body">
${bodyContent}
</article>
<script>
  window.addEventListener('load', () => {
    setTimeout(() => window.print(), 300);
  });
</script>
</body>
</html>`;
}

export async function exportToPDF(
    schema: TreeStorageSchema,
    scope: { workspaceID?: string } = {}
): Promise<void> {
    const markdown = buildMarkdownExport(schema, scope);
    const bodyHtml = await marked.parse(markdown);

    let title = 'Notes Export';
    if (scope.workspaceID) {
        const ws = (schema.workspaces || []).find((w) => w.id === scope.workspaceID);
        title = `${ws?.name || 'Workspace'} — Notes Export`;
    } else {
        title = 'All Workspaces — Notes Export';
    }

    const html = wrapHtmlDocument(title, bodyHtml);
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await chrome.tabs.create({ url: dataUrl });
}

export async function exportMoodboardToPDF(
    schema: TreeStorageSchema,
    scope: { workspaceID?: string } = {}
): Promise<void> {
    const markdown = buildMoodboardExport(schema, scope);
    const bodyHtml = await marked.parse(markdown);

    let title = 'Moodboard Export';
    if (scope.workspaceID) {
        const ws = (schema.workspaces || []).find((w) => w.id === scope.workspaceID);
        title = `${ws?.name || 'Workspace'} — Moodboard Export`;
    } else {
        title = 'All Workspaces — Moodboard Export';
    }

    const html = wrapHtmlDocument(title, bodyHtml);
    const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    await chrome.tabs.create({ url: dataUrl });
}
