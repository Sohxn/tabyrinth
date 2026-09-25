import React, { useEffect } from "react";
import { useTreeStore } from "@/src/store/useTreeStore";
import { sanitizeHTML } from "@/src/utils/sanitizeHTML";
import { type MoodboardItem, type MoodboardUnit } from "@/src/types";
import { StorageService } from "@/src/services/storage";

// dimensions
const COL_COUNT = 3;
const COL_WIDTH = 220;
const MARGIN = 12;
const CAPTION_LINE_HEIGHT = 24;

// masonry layout
function packUnits(units: MoodboardUnit[]) {
    const colHeights = new Array(COL_COUNT).fill(0);
    const columns: MoodboardUnit[][] = Array.from({
        length: COL_COUNT
    }, () => []);

    units.forEach((unit) => {
        const shortestColIdx = colHeights.indexOf(Math.min(...colHeights));
        const ratio = unit.primary.aspectRatio ?? 1;
        const primaryHeight = unit.primary.type === 'image' ? COL_WIDTH / ratio : 80;
        const captionHeight = unit.linked.length * CAPTION_LINE_HEIGHT;
        // snap
        colHeights[shortestColIdx] += primaryHeight + captionHeight + MARGIN;
        columns[shortestColIdx]?.push(unit);
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

    // packing 
    const units = getMoodboardUnits(activeWorkspaceID);
    const cols = packUnits(units);

    const handleImageLoad = (item: MoodboardItem, e: React.SyntheticEvent<HTMLImageElement>) => {
        if (item.aspectRatio) return;
        const img = e.currentTarget;
        if (img.naturalHeight && img.naturalWidth) {
            setItemAspectRatio(item.id, img.naturalWidth / img.naturalHeight);
        }
    };

    const handleDragStart = (e: React.DragEvent, itemID: string) => {
        e.dataTransfer.setData('text/moodboard-item', itemID);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDropOnImage = (e: React.DragEvent, imageID: string) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedID = e.dataTransfer.getData('text/moodboard-item');
        if (draggedID && draggedID !== imageID) {
            linkMoodboardItem(draggedID, imageID, 'caption');
        }
    };

    const handleDropOnBoard = (e: React.DragEvent) => {
        e.preventDefault();
        const draggedID = e.dataTransfer.getData('text/moodboard-item');
        if (draggedID) unlinkMoodboardItem(draggedID);
    }

    useEffect(() => {
        init();
        const listener = (
            changes: {
                [key: string]: chrome.storage.StorageChange
            },
            area: string
        ) => {
            if (area != 'local' || !changes.tabTreeData) return;
            StorageService.get().then(syncFromStorage);
        };

        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    return (
        <div onDragOver={(e) => e.preventDefault()} onDrop={handleDropOnBoard} className="flex gap-3 p-3 min-h-screen bg-black/80 backdrop-blur-md w-full h-full z-[2147483647] rounded-3xl border border-white/10 overflow-x-auto overflow-y-auto">
            {cols.map((col, colIdx) => (
                <div key={colIdx} className="flex-1 flex flex-col gap-3 min-w-[240px]">
                    {col.map((unit) => (
                        <div
                            key={unit.primary.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, unit.primary.id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDropOnImage(e, unit.primary.id)}
                            className="relative rounded-2xl border-2 border-[#333333] bg-black overflow-hidden group">
                            {unit.primary.type === 'image' ? (
                                <img
                                    src={unit.primary.content}
                                    onLoad={(e) => handleImageLoad(unit.primary, e)}
                                    className="w-full block"
                                    draggable={false} />
                            ) : (
                                <div
                                    className="note-content p-3 text-xs text-gray-200"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHTML(unit.primary.content) }} />
                            )}

                            <button
                                onClick={() => deleteMoodboardItem(unit.primary.id)}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 h-6 w-6 rounded-full bg-white/90 text-black text-xs font-bold">
                                ✕
                            </button>

                            {unit.linked.map((caption) => (
                                <div key={caption.id} draggable onDragStart={(e) => handleDragStart(e, caption.id)}
                                    className="relative border-t border-white/10 group/caption">
                                    <div
                                        className="p-2 pr-6 text-[11px] text-gray-300 note-content"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHTML(caption.content) }} />
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
    );
}