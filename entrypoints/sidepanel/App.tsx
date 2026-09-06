import React, {useState, useEffect} from "react";
import { StorageService } from "@/src/services/storage";
import { useTreeStore } from "@/src/store/useTreeStore";
import type { TreeStorageSchema } from "@/src/types";


export default function App() {
    const {nodes, init, syncFromStorage, focusTab, closeTab} = useTreeStore();

    useEffect(() => {
      init();

      const handleStorageChange = (changes: {[key: string]: chrome.storage.StorageChange}) => {
        if(changes.tabTreeData?.newValue){
          syncFromStorage(changes.tabTreeData?.newValue as TreeStorageSchema);
        }
      };

      chrome.storage.onChanged.addListener(handleStorageChange);
      return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    const activeNodeCount = Object.values(nodes).filter((n) => !n.isClosed).length;

    return(
        <div className="flex flex-col h-screen w-full bg-[#000000] text-[#e3e1e5] p-3 text-xs select-none">
      <div className="flex items-center justify-between pb-3">
        <span className="font-semibold text-sm tracking-wide">Tabs</span>
        <span className="text-[10px] text-gray-400 bg-[#2b2432] px-2 py-0.5 rounded-full">
          {activeNodeCount} Active
        </span>
      </div>

      <div className="flex-1 overflow-y-auto mt-3 space-y-1.5">
        {Object.keys(nodes).length === 0 ? (
          <p className="text-gray-500 italic text-center mt-10">Open tabs to verify state capture...</p>
        ) : (
          Object.values(nodes).map((node) => (
            <div
              key={node.id}
              onClick={() => focusTab(node.id)}
              className={`p-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
                node.isClosed
                  ? 'bg-[#241e2a] border-[#2e2636] opacity-50'
                  : 'bg-[#2b2432] border-[#3b3244] hover:border-[#52445e]'
              }`}
            >
              <div className="flex items-center space-x-2 truncate pr-2">
                {node.favIconURL ? (
                  <img src={node.favIconURL} alt="" className="w-4 h-4 rounded-sm flex-shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-sm bg-gray-600 flex-shrink-0" />
                )}
                <span className={`truncate ${node.isClosed ? 'line-through text-gray-500' : ''}`}>
                  {node.title}
                </span>
              </div>

              {!node.isClosed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(node.id);
                  }}
                  className="text-gray-400 hover:text-white px-1.5 py-0.5 rounded hover:bg-[#3d3247]"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
    );
}