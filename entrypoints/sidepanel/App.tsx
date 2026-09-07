import React, { useEffect } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { TreeNode } from './TreeNode';
import { type TreeStorageSchema } from '@/src/types';

export default function App() {
  const { rootIDs, init, syncFromStorage, nodes } = useTreeStore();

  useEffect(() => {
    init();

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.tabTreeData?.newValue) {
        syncFromStorage(changes.tabTreeData.newValue as TreeStorageSchema);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const activeCount = Object.values(nodes).filter((n) => !n.isClosed).length;

  return (
    <div className="flex flex-col h-screen w-full bg-[#000000] text-[#e3e1e5] p-2 text-xs select-none">

      {/* header */}
      <div className="flex items-center justify-between mb-2 px-2 py-2">
        <span className="font-bold text-lg tracking-wide text-gray-200">Tabyrinth</span>
        <span className="text-[12px] text-gray-400 bg-[#000000] px-2 py-1 mt-1 rounded-full border-2 border-[#3b3244]">
          {activeCount} tabs active
        </span>
      </div>

      {/* tree */}
      <div className="flex-1 overflow-y-auto no-scrollbar pr-1">
        {!rootIDs || rootIDs.length === 0 ? (
          <p className="text-gray-500 italic text-center mt-10">No active tabs</p>
        ) : (
          rootIDs.map((rootID) => <TreeNode key={rootID} nodeID={rootID} depth={0} />)
        )}
      </div>
    </div>
  );
}