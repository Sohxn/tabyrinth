import React, { useEffect, useRef } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { TreeNode } from './TreeNode';
import { type TreeStorageSchema } from '@/src/types';
import { StorageService } from '@/src/services/storage';
import { MediaCard } from './MediaCard';

export default function App() {
  const { rootIDs, init, syncFromStorage, nodes } = useTreeStore();
  const treeContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (treeContainerRef.current) {
      treeContainerRef.current.scrollTop = treeContainerRef.current.scrollHeight;
    }
  }, [rootIDs]);

  useEffect(() => {
    const port = chrome.runtime.connect({
      name: 'keepalive'
    });

    const ping = setInterval(() => {
      try {
        port.postMessage({
          type: 'ping'
        });
      } catch { }
    }, 20_000);

    return () => {
      clearInterval(ping);
      port.disconnect();
    }
  }, []);

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

  // create new tab
  const createNewTab = async () => {
    await chrome.tabs.create({});
  }
  // reset button function
  const resetTree = async () => {
    await StorageService.resetToActiveTabsOnly();
  }

  return (
    <div className="flex flex-col h-screen w-full bg-[#21252b] text-[#e3e1e5] p-2 text-xs select-none overflow-hidden">

      {/* header */}
      <div className="flex items-center justify-between px-2 h-16">
        <div className="font-logo text-lg text-gray-200">Tabyrinth</div>

        <div className='flex items-center justify-center rounded-3xl h-10 w-full max-w-xs bg-black mx-4'>...</div>

        <div className="inline-flex items-center justify-center whitespace-nowrap 
        text-[15px] leading-none font-bold text-white bg-[#FF6314] 
        px-4 h-8 rounded-full shadow-sm shadow-black/30">
          {`${activeCount} ${activeCount === 1 ? 'tab' : 'tabs'}`}
        </div>
      </div>

      {/* media card if there is any */}
      <MediaCard />

      {/* tree */}
      {/* add padding after fixing alignment here */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Scrollable list area */}
        <div ref={treeContainerRef} className="flex-1 overflow-y-auto no-scrollbar">
          {!rootIDs || rootIDs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 mt-10">
              <p className="text-gray-500 italic text-center">No active tabs</p>
              <button
                onClick={createNewTab}
                className="flex items-center gap-2 px-3 py-1.5 
                rounded-full bg-white/10 hover:bg-white/20 text-gray-200 
                transition-all cursor-pointer">
                <span className="font-bold text-sm">+</span>
                <span>New Tab</span>
              </button>
            </div>
          ) : (
            // case: there are active tabs
            // tab nodes
            <div className="flex flex-col gap-2">
              {rootIDs.map((rootID) => (
                <TreeNode key={rootID} nodeID={rootID} depth={0} />
              ))}
            </div>

          )}

          {/* new tab button */}
          <button
            onClick={createNewTab}
            className="flex items-center gap-2.5 h-12 w-full px-2 py-1.5 mt-1 rounded-3xl 
          text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer 
          group justify-center items-center border-2 border-white-100 shrink-0 mt-4">
            <div className="w-5 h-5 flex items-center justify-center text-gray-400 group-hover:text-gray-300 transition-colors">
              <span className="text-lg font-bold leading-none">+</span>
            </div>
            <span className="text-xs font-medium">New tab</span>
          </button>
        </div>


      </div>

      {/* footer */}
      <div className='shrink-0 bottom-3 left-3 right-3 grid grid-cols-6 gap-4 items-center justify-center bg-transparent'>
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