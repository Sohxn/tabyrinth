import React, { useEffect, useRef, useState } from "react";
import { useTreeStore } from "@/src/store/useTreeStore";
import { sanitizeHTML } from "@/src/utils/sanitizeHTML";
import { type MoodboardItem, type MoodboardUnit } from "@/src/types";
import { StorageService } from "@/src/services/storage";
import { MinusIcon, PlusIcon, DownloadSimpleIcon } from "@phosphor-icons/react";

// Layout constants
const MIN_COLS = 2;
const MAX_COLS = 4;
const DEFAULT_COLS = 2;
const GAP = 12;
const PADDING = 12;
const MAX_COL_WIDTH = 160;
const CAPTION_LINE_HEIGHT = 24;

function packUnits(units: MoodboardUnit[], colWidth: number, colCount: number) {
    const colHeights = new Array(colCount).fill(0);
    const columns: MoodboardUnit[][] = Array.from({ length: colCount }, () => []);

    units.forEach((unit) => {
        const shortestColIdx = colHeights.indexOf(Math.min(...colHeights));
        const targetCol = columns[shortestColIdx];
        if (!targetCol) return; // unreachable given colCount > 0, but satisfies TS and fails safe

        const ratio = unit.primary.aspectRatio ?? 1;
        const primaryHeight = unit.primary.type === "image" ? colWidth / ratio : 80;
        const captionHeight = unit.linked.length * CAPTION_LINE_HEIGHT;
        colHeights[shortestColIdx] += primaryHeight + captionHeight + GAP;
        targetCol.push(unit);
    });

    return columns;
}

export function Board() {
    const init = useTreeStore((s) => s.init);
    const syncFromStorage = useTreeStore((s) => s.syncFromStorage);

    const activeWorkspaceID = useTreeStore((s) => s.activeWorkspaceID);
    const getMoodboardUnits = useTreeStore((s) => s.getMoodboardUnits);
    const linkMoodboardItem = useTreeStore((s) => s.linkMoodboardItem);
    const unlinkMoodboardItem = useTreeStore((s) => s.unlinkMoodboardItem);
    const deleteMoodboardItem = useTreeStore((s) => s.deleteMoodboardItem);
    const setItemAspectRatio = useTreeStore((s) => s.setItemAspectRatio);


    const [colCount, setColCount] = useState(DEFAULT_COLS);

    const containerRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) setContainerWidth(entry.contentRect.width);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    const availableWidth = containerWidth - PADDING - (colCount - 1) * GAP;
    const colWidth =
        availableWidth > 0
            ? Math.min(availableWidth / colCount, MAX_COL_WIDTH)
            : 0;

    const units = getMoodboardUnits(activeWorkspaceID)
    const itemCount = units.length;

    const cols = colWidth > 0
        ? packUnits(units, colWidth, colCount)
        : Array.from({ length: colCount }, () => []);

    const handleImageLoad = (
        item: MoodboardItem,
        e: React.SyntheticEvent<HTMLImageElement>
    ) => {
        if (item.aspectRatio) return;
        const img = e.currentTarget;
        if (img.naturalHeight && img.naturalWidth) {
            setItemAspectRatio(item.id, img.naturalWidth / img.naturalHeight);
        }
    };

    const handleDragStart = (e: React.DragEvent, itemID: string) => {
        e.dataTransfer.setData("text/moodboard-item", itemID);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDropOnImage = (e: React.DragEvent, imageID: string) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedID = e.dataTransfer.getData("text/moodboard-item");
        if (draggedID && draggedID !== imageID) {
            linkMoodboardItem(draggedID, imageID, "caption");
        }
    };

    const handleDropOnBoard = (e: React.DragEvent) => {
        e.preventDefault();
        const draggedID = e.dataTransfer.getData("text/moodboard-item");
        if (draggedID) unlinkMoodboardItem(draggedID);
    };

    useEffect(() => {
        init();
        const listener = (
            changes: { [key: string]: chrome.storage.StorageChange },
            area: string
        ) => {
            if (area != "local" || !changes.tabTreeData) return;
            StorageService.get().then(syncFromStorage);
        };

        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    return (
        <div className="relative flex flex-col h-full min-h-0 w-full bg-gray-800 dotted-back rounded-3xl border-2 border-white/20 overflow-hidden">
            {/* board controls */}
            <div className="absolute flex items-center bottom-2 right-2 gap-2 px-3 py-2 shrink-0">
                {/* liquid glass toolbar */}

                {itemCount > 1 &&
                    <div className="flex rounded-3xl bg-white/10 backdrop-blur-xl border-2 border-white/30 
                    h-12 z-12 p-2 justify-center items-center text-white">
                        <span className="text-[10px] uppercase font-bold tracking-wide mr-1">Columns</span>
                        <button
                            onClick={() => setColCount((c) => Math.max(MIN_COLS, c - 1))}
                            disabled={colCount <= MIN_COLS}
                            className="h-6 w-6 flex items-center justify-center rounded-full 
                        bg-white/10 border-1 border-white/40 hover:bg-white/20 disabled:opacity-30 
                        disabled:cursor-not-allowed 
                        transition-colors"
                            title="Fewer columns">
                            <MinusIcon size={12} weight="bold" />
                        </button>
                        <span className="text-xs font-mono w-4 text-center">{colCount}</span>
                        <button
                            onClick={() => setColCount((c) => Math.min(MAX_COLS, c + 1))}
                            disabled={colCount >= MAX_COLS}
                            className="h-6 w-6 flex items-center justify-center rounded-full 
                        bg-white/10 border-1 border-white/40 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="More columns">
                            <PlusIcon size={12} weight="bold" />
                        </button>
                    </div>
                }
            </div>

            {/* masonry canvas */}
            <div
                ref={containerRef}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDropOnBoard}
                className="flex-1 min-h-0 flex items-start gap-3 p-3 w-full z-4
                    overflow-x-hidden overflow-y-auto no-scrollbar justify-center">

                {cols.map((col, colIdx) => (
                    <div
                        key={colIdx}
                        className="flex flex-col gap-3"
                        style={{
                            width: colWidth > 0 ? `${colWidth}px` : "100%",
                            flexShrink: 0,
                        }}>
                        {col.map((unit) => (
                            <div
                                key={unit.primary.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, unit.primary.id)}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => handleDropOnImage(e, unit.primary.id)}
                                className="relative rounded-2xl border-2 border-[#333333] bg-black overflow-hidden group">
                                {unit.primary.type === "image" ? (
                                    <img
                                        src={unit.primary.content}
                                        onLoad={(e) => handleImageLoad(unit.primary, e)}
                                        className="w-full h-auto block object-contain"
                                        draggable={false} />
                                ) : (
                                    <div
                                        className="note-content p-3 text-xs text-gray-200"
                                        dangerouslySetInnerHTML={{
                                            __html: sanitizeHTML(unit.primary.content),
                                        }} />
                                )}

                                <button
                                    onClick={() => deleteMoodboardItem(unit.primary.id)}
                                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 h-6 w-6 rounded-full bg-white/90 text-black text-xs font-bold">
                                    ✕
                                </button>

                                {unit.linked.map((caption) => (
                                    <div
                                        key={caption.id}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, caption.id)}
                                        className="relative border-t border-white/10 group/caption">
                                        <div
                                            className="p-2 pr-6 text-[11px] text-gray-300 note-content"
                                            dangerouslySetInnerHTML={{
                                                __html: sanitizeHTML(caption.content),
                                            }} />
                                        <button
                                            onClick={() => unlinkMoodboardItem(caption.id)}
                                            title="Detach caption"
                                            className="absolute top-1 right-1 opacity-0 group-hover/caption:opacity-100 text-gray-400 hover:text-red-400 text-[10px]">
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}