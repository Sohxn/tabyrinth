import React from "react";
import { useTreeStore } from "@/src/store/useTreeStore";

export function MediaCard() {
  const activeMediaTabID = useTreeStore((state) => state.activeMediaTabID);
  const nodes = useTreeStore((state) => state.nodes);
  // special media node
  const mediaNode = activeMediaTabID ? nodes[activeMediaTabID] : null;

  if (!mediaNode || mediaNode.isClosed) return null;

  const handleFocusMediaTab = async () => {
    await chrome.tabs.update(Number(mediaNode.id), { active: true });
    await chrome.windows.update(mediaNode.windowID, { focused: true });
  };

  const handleMuteMediaTab = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const tab = await chrome.tabs.get(Number(mediaNode.id));
    await chrome.tabs.update(Number(mediaNode.id), { muted: !tab.mutedInfo?.muted });
  };

  return (
    <div
      onClick={handleFocusMediaTab}
      className="mx-1 h-20 mb-3 p-2 flex items-center 
            gap-2 rounded-3xl bg-red border border-red-400 
            backdrop-blur-md cursor-pointer 
            hover:border-red-500 transition-all 
            shadow-lg group">

      {/* visualizer */}
      <div className="flex items-end gap-[2px] h-3.5 w-3.5 shrink-0 ml-1">
        <span className="w-1 bg-red-400 animate-bounce h-full rounded-full" />
        <span className="w-1 bg-red-400 animate-bounce h-2/3 rounded-full [animation-delay:0.2s]" />
        <span className="w-1 bg-red-400 animate-bounce h-4/5 rounded-full [animation-delay:0.4s]" />
      </div>

      {/* Favicon */}
      {mediaNode.favIconURL ? (
        <img src={mediaNode.favIconURL} alt="" className="w-4 h-4 rounded shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded bg-red-800/50 shrink-0" />
      )}

      {/* Title */}
      <span className="truncate flex-1 text-xs font-medium text-white-100 group-hover:text-white transition-colors">
        {mediaNode.title || 'Playing Audio'}
      </span>

      {/* Mute Button */}
      <button
        onClick={handleMuteMediaTab}
        className="p-1 rounded-md hover:bg-white/10 text-red-300 hover:text-white transition-colors shrink-0"
        title="Mute / Unmute Tab"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010
           7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109
            12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
        </svg>
      </button>
    </div>
  );
}