import React, { useEffect } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { TreeNode } from './TreeNode';
import { type TreeStorageSchema } from '@/src/types';
import { StorageService } from '@/src/services/storage';

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

  // reset button function
  const resetTree = async () => {
    await StorageService.resetToActiveTabsOnly();
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#000000] text-[#e3e1e5] p-2 text-xs select-none">

      {/* header */}
      <div className="flex items-center justify-between mb-2 px-2 py-2 grid grid-cols-8 gap-2">
        <span className="font-bold col-span-2 text-lg tracking-wide text-gray-200 font-bold">Tabyrinth</span>

        <div className='flex col-span-4 rounded-3xl h-10 mx-2 w-full border-[1.5px] bg-white'></div>
        
        <div className="flex col-span-2 text-[12px] text-gray-400 bg-[#000000] py-2 mt-1 ml-4 rounded-full border-2 border-[#3b3244] justify-center items-center">
          {`${activeCount} ${activeCount === 1 ? 'tab' : 'tabs'}`}
        </div>
      </div>

      {/* tree */}
      <div className="flex-1 overflow-y-auto no-scrollbar pr-1">
        {!rootIDs || rootIDs.length === 0 ? (
          <p className="text-gray-500 italic text-center mt-10">No active tabs</p>
        ) : (
          rootIDs.map((rootID) => <TreeNode key={rootID} nodeID={rootID} depth={0} />)
        )}
      </div>

      {/* footer */}
      <div className='absolute bottom-3 left-3 right-3 grid grid-cols-6 gap-4 items-center justify-center bg-transparent'>
        {/* search bar */}
        <div className='rounded-full border-[2px] border-white h-12 my-2 py-2 justify-center items-center grid grid-cols-4 col-span-4'>
          <div className='col-span-1 ml-4'>search icon</div>
          <div className='col-span-3 mr-4'>search areaaaaaa</div>
        </div>

        {/* clear tree button */}
        <button onClick={resetTree} className='rounded-full border-[2px] border-white h-12 justify-center items-center'>
          <span className='text-[15px] font-bold'>reset</span>
        </button>

        {/* settings button */}
        <div className='rounded-full border-[2px] border-white h-12 justify-center items-center'>

        </div>
      </div>
    </div>
  );
}