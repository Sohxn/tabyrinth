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
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2 mb-2">
        <span className="font-semibold text-sm tracking-wide text-gray-200">Tabs</span>
        <span className="text-[10px] text-gray-400 bg-[#2b2432] px-2 py-0.5 rounded-full border border-[#3b3244]">
          {activeCount} Active
        </span>
      </div>

      {/* Recursive Spatial Tree Container */}
      <div className="flex-1 overflow-y-auto pr-1">
        {!rootIDs || rootIDs.length === 0 ? (
          <p className="text-gray-500 italic text-center mt-10">No active tabs</p>
        ) : (
          rootIDs.map((rootID) => <TreeNode key={rootID} nodeID={rootID} depth={0} />)
        )}
      </div>
    </div>
  );
}