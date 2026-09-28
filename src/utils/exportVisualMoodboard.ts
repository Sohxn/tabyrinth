import { type TreeStorageSchema, type MoodboardUnit } from "../types";
import { packUnits, LAYOUT_CONSTANTS } from "./moodboardLayout";
import { sanitizeHTML } from "./sanitizeHTML";
import { toPng } from "html-to-image";

export const VISUAL_EXPORT_STYLES = `
    body {
        background-color: #111827;
        color: #e5e7eb;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        margin: 0;
        padding: 20px;
        display: flex;
        justify-content: center;
    }
    .moodboard-container {
        display: flex;
        gap: ${LAYOUT_CONSTANTS.GAP}px;
        background-color: #111827;
        padding: ${LAYOUT_CONSTANTS.PADDING}px;
        border-radius: 24px;
        border: 2px solid rgba(255, 255, 255, 0.2);
    }
    .moodboard-column {
        display: flex;
        flex-direction: column;
        gap: ${LAYOUT_CONSTANTS.GAP}px;
        width: ${LAYOUT_CONSTANTS.MAX_COL_WIDTH}px;
        flex-shrink: 0;
    }
    .moodboard-item {
        position: relative;
        border-radius: 16px;
        border: 2px solid #333;
        background-color: #000;
        overflow: hidden;
    }
    .moodboard-image {
        width: 100%;
        height: auto;
        display: block;
        object-fit: contain;
    }
    .moodboard-note {
        padding: 12px;
        font-size: 12px;
        color: #e5e7eb;
    }
    .moodboard-caption {
        position: relative;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        padding: 8px 12px;
        font-size: 11px;
        color: #d1d5db;
    }
    @media print {
        body { background-color: #111827 !important; -webkit-print-color-adjust: exact; }
        .moodboard-container { background-color: #111827 !important; border: 2px solid rgba(255, 255, 255, 0.2) !important; }
        .moodboard-item { background-color: #000 !important; border: 2px solid #333 !important; }
    }
`;

function renderUnitHtml(unit: MoodboardUnit): string {
    const primary = unit.primary;
    let contentHtml = '';

    if (primary.type === 'image') {
        contentHtml = `<img src="${primary.content}" class="moodboard-image" />`;
    } else {
        contentHtml = `<div class="moodboard-note">${sanitizeHTML(primary.content)}</div>`;
    }

    const captionsHtml = unit.linked.map(caption =>
        `<div class="moodboard-caption">${sanitizeHTML(caption.content)}</div>`
    ).join('');

    return `
        <div class="moodboard-item">
            ${contentHtml}
            ${captionsHtml}
        </div>
    `;
}

export function buildVisualMoodboardHtml(
    units: MoodboardUnit[],
    colCount: number = LAYOUT_CONSTANTS.DEFAULT_COLS
): string {
    const colWidth = LAYOUT_CONSTANTS.MAX_COL_WIDTH;
    const cols = packUnits(units, colWidth, colCount);

    const colsHtml = cols.map(col => `
        <div class="moodboard-column">
            ${col.map(renderUnitHtml).join('')}
        </div>
    `).join('');

    return `
        <div class="moodboard-container">
            ${colsHtml}
        </div>
    `;
}

export async function downloadVisualMoodboardAsHtml(units: MoodboardUnit[], filename: string) {
    const body = buildVisualMoodboardHtml(units);
    const fullHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Moodboard Export</title>
            <style>${VISUAL_EXPORT_STYLES}</style>
        </head>
        <body>
            ${body}
        </body>
        </html>
    `;
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export async function downloadVisualMoodboardAsImage(units: MoodboardUnit[], filename: string) {
    const body = buildVisualMoodboardHtml(units);

    // Create a hidden container to render the DOM for the snapshot
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.innerHTML = `
        <style>${VISUAL_EXPORT_STYLES}</style>
        ${body}
    `;
    document.body.appendChild(container);

    try {
        const dataUrl = await toPng(container, {
            backgroundColor: '#111827',
            quality: 0.95
        });
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
    } finally {
        document.body.removeChild(container);
    }
}
