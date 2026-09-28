import { type MoodboardUnit } from "../types";

export const LAYOUT_CONSTANTS = {
    MIN_COLS: 2,
    MAX_COLS: 4,
    DEFAULT_COLS: 2,
    GAP: 12,
    PADDING: 12,
    MAX_COL_WIDTH: 160,
    CAPTION_LINE_HEIGHT: 24,
};

export function packUnits(units: MoodboardUnit[], colWidth: number, colCount: number) {
    const colHeights = new Array(colCount).fill(0);
    const columns: MoodboardUnit[][] = Array.from({ length: colCount }, () => []);

    units.forEach((unit) => {
        const shortestColIdx = colHeights.indexOf(Math.min(...colHeights));
        const targetCol = columns[shortestColIdx];
        if (!targetCol) return;

        const ratio = unit.primary.aspectRatio ?? 1;
        const primaryHeight = unit.primary.type === "image" ? colWidth / ratio : 80;
        const captionHeight = unit.linked.length * LAYOUT_CONSTANTS.CAPTION_LINE_HEIGHT;
        colHeights[shortestColIdx] += primaryHeight + captionHeight + LAYOUT_CONSTANTS.GAP;
        targetCol.push(unit);
    });

    return columns;
}
