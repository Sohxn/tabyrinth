import React, { useState, useEffect, useRef } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { TreeNode } from './TreeNode';
import { type TreeStorageSchema } from '@/src/types';
import { StorageService } from '@/src/services/storage';
import { MediaCard } from './MediaCard';
import { WorkspaceNotch } from './WorkspaceNotch';
import { GearIcon, ArrowClockwiseIcon, MagnifyingGlassIcon, PlusIcon, Ghost, RowsPlusTopIcon, SlidersHorizontalIcon, CaretCircleDownIcon } from '@phosphor-icons/react';

// only for sync 
import { createCheckoutSession, activateLicenseKey, getLicenseKey } from '@/src/services/sync';
import { GhostGroup } from './GhostGroup';


export default function App() {
  const { rootIDs, init, syncFromStorage, nodes, activeWorkspaceID, getRegularRootIDs, getGhostGroup, assignTabToWorkspace } = useTreeStore(); const treeContainerRef = useRef<HTMLDivElement>(null);
  const [isResettingGhosts, SetIsResettingGhosts] = useState(false);

  // settings related
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activationMail, setActivationMail] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  // workspace related 
  const regularRootIDs = getRegularRootIDs(activeWorkspaceID);
  const ghostGroup = getGhostGroup(activeWorkspaceID);

  // settings button function
  const handleOpenSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  }

  useEffect(() => {
    if (treeContainerRef.current) {
      treeContainerRef.current.scrollTop = treeContainerRef.current.scrollHeight;
    }
  }, [regularRootIDs]);

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
    // local license check 
    chrome.storage.local.get(["isPro", "licenseKey"], (res) => {
      if (res.isPro) setIsPro(true);
      if (res.licenseKey) setActiveKey((res.licenseKey) as string);
    });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.tabTreeData?.newValue) {
        syncFromStorage(changes.tabTreeData.newValue as TreeStorageSchema);
      }
      if (changes.isPro) {
        setIsPro(Boolean(changes.isPro.newValue));
      }
      if (changes.licenseKey) {
        setActiveKey((changes.licenseKey.newValue as string) || null);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const activeCount = Object.values(nodes).filter((n) => !n.isClosed).length;

  // create new tab
  const createNewTab = async () => {
    const newTab = await chrome.tabs.create({});
    if (newTab.id) {
      assignTabToWorkspace(String(newTab.id), activeWorkspaceID);
    }
  }
  const resetTree = async () => {
    SetIsResettingGhosts(true);
    setTimeout(async () => {
      await StorageService.resetToActiveTabsOnly();
      SetIsResettingGhosts(false);
    }, 300);
  }

  const handleBuyPro = async () => {
    if (!activationMail || !activationMail.includes('@')) {
      setStatusMessage({ text: 'Please enter a valid email address.', isError: true });
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    try {
      const paymentUrl = await createCheckoutSession(activationMail);
      chrome.tabs.create({ url: paymentUrl });
      setStatusMessage({ text: 'Checkout page opened! Complete payment to receive your key via email.', isError: false });
    } catch (err: any) {
      setStatusMessage({ text: err.message || 'Failed to create payment link.', isError: true });
    } finally {
      setLoading(false);
    }
  };

  const handleActivateKey = async () => {
    if (!inputKey.trim()) {
      setStatusMessage({ text: 'Please enter a license key', isError: true });
      return;
    }

    setLoading(true);
    setStatusMessage(null);
    const result = await activateLicenseKey(inputKey);
    setLoading(false);

    if (result.success) {
      setIsPro(true);
      setActiveKey(inputKey.trim());
      setStatusMessage({ text: 'Tabyrinth Plus activated', isError: false });
      setInputKey('');
    } else {
      setStatusMessage({ text: result.error || 'Invalid license key.', isError: true });
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#21252b] text-[#e3e1e5] p-2 text-xs select-none overflow-hidden">

      {/* header */}
      <div className="flex items-center justify-between px-2 h-16">
        {isPro ?
          <div className="font-logo text-sm text-gray-200"></div> :
          <div className="font-logo text-lg text-gray-200">Tabyrinth</div>}
        {isPro && (
          <span className="text-2xl text-[#FF6314] ml-4 mb-1 font-bold tracking-wider">
            plus
          </span>
        )}

        {/* <div className='flex items-center justify-center rounded-3xl h-10 w-full max-w-xs bg-black mx-4'>...</div> */}
        <WorkspaceNotch />

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
          {!regularRootIDs || regularRootIDs.length === 0 ? (
            <div className="flex flex-col items-center justify-center m-2">
              <p className="text-gray-400 font-bold text-lg text-center">No active tabs in this workspace</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {/* {regularRootIDs.map((rootID) => (
                <TreeNode key={rootID} nodeID={rootID} depth={0} isResettingGhosts={isResettingGhosts} />
              ))} */}
              {regularRootIDs.map((rootID) => {
                const node = nodes[rootID];
                const isChain = node && node.childrenIDs && node.childrenIDs.length > 0;

                // bordered groups
                return isChain ?
                  (<div key={rootID} className="border-2 border-white/15 rounded-3xl py-2 px-2">
                    <TreeNode nodeID={rootID} depth={0} isResettingGhosts={isResettingGhosts} />
                  </div>) :
                  (
                    <TreeNode key={rootID} nodeID={rootID} depth={0} isResettingGhosts={isResettingGhosts} />
                  );
              })}
            </div>
          )}

          {ghostGroup && <GhostGroup group={ghostGroup} isResettingGhosts={isResettingGhosts} />}

          {/* new tab button */}
          <button
            onClick={createNewTab}
            className="flex items-center gap-2.5 h-12 w-full px-2 py-1.5 mt-1 rounded-2xl 
          text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer 
          group justify-center items-center bg-black/20 border-2 border-white/20 shrink-0 mt-4">
            <div className="w-5 h-5 flex items-center justify-center text-white group-hover:text-gray-300 transition-colors">
              <div className="text-lg font-bold leading-none">
                <RowsPlusTopIcon size={24} weight='fill' />
              </div>
            </div>
            <span className="text-sm text-white font-medium">New tab</span>
          </button>
        </div>


      </div>

      {/* footer */}
      <div className='shrink-0 bottom-3 left-3 right-3 grid grid-cols-6 gap-4 items-center justify-center bg-transparent'>
        {/* search bar */}
        <div className='rounded-full h-12 my-2 py-2 justify-center items-center grid grid-cols-4 col-span-4
        bg-[#21252b] shadow-[inset_9px_9px_18px_#121418,inset_-9px_-9px_18px_#30363e]'>
          <div className='col-span-1 ml-4'><MagnifyingGlassIcon size={24} /></div>
          <div className='flex col-span-3 justify-center'></div>
        </div>

        {/* clear tree button */}
        <button onClick={resetTree} className='flex h-12 justify-center items-center'>
          <ArrowClockwiseIcon size={32} />
        </button>

        {/* settings button */}
        <button onClick={handleOpenSettings} className='flex h-12 justify-center items-center'>
          <SlidersHorizontalIcon size={32} weight="fill" />
        </button>
      </div>

      {/* settings element */}
      {isSettingsOpen && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">
              Tabyrinth
              <span className='text-md font-bold text-[#FF6314] text-center'> plus</span></h2>
            <button
              onClick={() => { setIsSettingsOpen(false); setStatusMessage(null); }}
              className="text-gray-400 hover:text-white text-base font-bold px-2">
              ✕
            </button>
          </div>

          {statusMessage && (
            <div className={`p-2.5 rounded-xl text-xs mb-3 ${statusMessage.isError ? 'bg-red-600 text-white font-bold text-[14px]' : 'bg-green-600 text-white font-bold text-[14px]'}`}>
              {statusMessage.text.toUpperCase()}
            </div>
          )}

          {isPro ? (
            <div className="bg-white/5 border border-white/2 rounded-2xl p-4 flex flex-col gap-2">
              <div className="text-sm text-gray-400">Plus License Active</div>
              <div className="font-mono font-bold text-xl text-[#FF6314] break-all">{activeKey}</div>
              <div className="text-[14px] text-gray-400">
                Cross platform sync is active
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Buy Pro Section */}
              <div className="bg-white/15 rounded-2xl p-4 flex flex-col gap-2">
                <span className="font-bold text-sm text-white">Upgrade to Tabyrinth Plus</span>
                <span className="text-gray-300 text-[13px]">
                  Get multi-device Cloud Sync with a <span className='text-[#FF6314]'>$10</span> Lifetime License.
                </span>

                <input
                  type="email"
                  placeholder="Enter activation email"
                  value={activationMail}
                  onChange={(e) => setActivationMail(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6314]"
                />

                <button
                  onClick={handleBuyPro}
                  disabled={loading}
                  className="bg-[#FF6314] hover:bg-[#ff742d] disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs transition-colors"
                >
                  {loading ? 'Generating Link...' : 'Buy Lifetime Access ($10)'}
                </button>
              </div>

              {/* Activate Key Section */}
              <div className="bg-white/15 rounded-2xl p-3.5 flex flex-col gap-2">
                <span className="font-bold text-sm text-white">Already have a key?</span>
                <input
                  type="text"
                  placeholder="PRO-XXXX-XXXX-XXXX"
                  value={inputKey}
                  onChange={(e) => setInputKey(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#FF6314] font-mono"
                />

                <button
                  onClick={handleActivateKey}
                  disabled={loading}
                  className="bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold py-2 rounded-xl text-xs transition-colors"
                >
                  {loading ? 'Verifying...' : 'Activate License'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}