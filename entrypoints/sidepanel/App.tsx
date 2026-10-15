import React, { useState, useEffect, useRef } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { TreeNode } from './TreeNode';
import { REMOTE_WORKSPACE_ID, type TreeStorageSchema } from '@/src/types';
import { StorageService } from '@/src/services/storage';
import { MediaCard } from './MediaCard';
import { WorkspaceNotch } from './WorkspaceNotch';
import { buildMarkdownExport, downloadMarkdown } from '@/src/utils/exportNotes';
import { buildMoodboardExport, downloadMoodboard } from '@/src/utils/exportMoodboard';
import { exportToPDF, exportMoodboardToPDF, exportVisualMoodboardToPDF } from '@/src/utils/exportPDF';
import { downloadVisualMoodboardAsHtml } from '@/src/utils/exportVisualMoodboard';
import { buildTrailExport, downloadTrail } from '@/src/utils/exportTrail';
import { Board } from '../board/Board';

// icon packs
import {
  ArrowClockwiseIcon, MagnifyingGlassIcon,
  SlidersHorizontalIcon, BookIcon, LightningIcon,
  PlusIcon, EyeClosedIcon, EyeIcon
} from '@phosphor-icons/react';

// only for sync 
import { createCheckoutSession, activateLicenseKey, isProActive } from '@/src/services/sync';
import { GhostGroup } from './GhostGroup';
import { CloudGroup } from './CloudGroup';
import { CitationExportPanel } from './CitationExportPanel';


export default function App() {
  const { init, syncFromStorage, nodes,
    activeWorkspaceID, getRegularRootIDs, getGhostGroup, assignTabToWorkspace, getMoodboardUnits,
    hotTabs, initHotTabs, launchHotTabSet } = useTreeStore(); const treeContainerRef = useRef<HTMLDivElement>(null);
  const [isResettingGhosts, SetIsResettingGhosts] = useState(false);

  // settings related
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isStarterPaneOpen, setIsStarterPaneOpen] = useState(false);
  const [isCitationPanelOpen, setIsCitationPanelOpen] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [activationMail, setActivationMail] = useState('');
  const [inputKey, setInputKey] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [isKeyVisible, setIsKeyVisible] = useState(false);

  // workspace related 
  const regularRootIDs = getRegularRootIDs(activeWorkspaceID);
  const ghostGroup = getGhostGroup(activeWorkspaceID);
  const cloudHasItems = useTreeStore((s) =>
    Object.values(s.nodes).some(
      (node) => node.isRemote && (
        activeWorkspaceID === REMOTE_WORKSPACE_ID ||
        (node.workspaceID || 'workspace-default') === activeWorkspaceID
      )
    )
  );

  // manual and automatic moodboard toggle
  const [isMoodboardToggled, setIsMoodboardToggled] = useState(false);
  const isMoodboardActive = isMoodboardToggled === true;

  // zustand moodboard data
  const moodboardItemCount = useTreeStore((s) =>
    Object.values(s.moodboardItems).filter(
      (i) => i.workspaceID === activeWorkspaceID
    ).length
  );
  const handleOpenSettings = () => {
    setIsSettingsOpen(!isSettingsOpen);
  }

  // Reads the persisted licence rather than the React flag, so a bypassed
  // UI that calls a Pro handler directly still gets rejected. Returns true
  // when the action may proceed. Surfaces a status message on rejection.
  const requirePro = async (): Promise<boolean> => {
    if (await isProActive()) return true;
    setStatusMessage({ text: 'Tabyrinth Plus required', isError: true });
    return false;
  };

  const handleCreateHotTabSet = async () => {
    if (!(await requirePro())) return;
    const name = window.prompt('Name this Hot Tab starter');
    if (!name?.trim()) return;

    try {
      const currentTabs = await chrome.tabs.query({ currentWindow: true });
      const items = currentTabs
        .filter((tab): tab is chrome.tabs.Tab & { url: string } =>
          typeof tab.url === 'string' &&
          !/^(chrome|edge|about|chrome-extension|moz-extension):/i.test(tab.url)
        )
        .map((tab) => ({
          url: tab.url,
          title: tab.title || tab.url,
          favIconUrl: tab.favIconUrl || undefined,
        }));

      if (items.length === 0) {
        throw new Error('No browser tabs with valid URLs were found.');
      }

      const schema = await StorageService.get();
      const hotTabSet = {
        id: `hot-tabs-${Date.now()}`,
        name: name.trim(),
        items,
        createdAt: Date.now(),
      };
      await StorageService.saveHotTabSet(hotTabSet);
      await initHotTabs();
      setIsStarterPaneOpen(true);
    } catch (error) {
      console.error('[LOG] Failed to create hot tab set:', error);
    }
  };

  const handleDeleteHotTabSet = async (setId: string) => {
    if (!(await requirePro())) return;
    try {
      await StorageService.get();
      await StorageService.deleteHotTabSet(setId);
      await initHotTabs();
    } catch (error) {
      console.error('[LOG] Failed to delete hot tab set:', error);
    }
  };

  // markdown export handlers 
  const handleMarkdownExportWorkspace = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    const wsName = (schema.workspaces || []).find(w => w.id === activeWorkspaceID)?.name || 'workspace';
    const markdown = buildMarkdownExport(
      schema,
      {
        workspaceID: activeWorkspaceID
      });
    downloadMarkdown(markdown, `tabyrinth-notes-${wsName.replace(/\s+/g, '-')}-${Date.now()}.md`);
  };

  const handleMarkdownExportAll = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    const markdown = buildMarkdownExport(schema);
    downloadMarkdown(markdown, `tabyrinth-notes-all-${Date.now()}.md`);
  };

  // PDF export handlers
  const handlePDFExportWorkspace = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    await exportToPDF(schema, { workspaceID: activeWorkspaceID });
  };

  const handlePDFExportAll = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    await exportToPDF(schema);
  };

  // Moodboard export handlers
  const handleMoodboardExportWorkspace = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    const wsName = (schema.workspaces || []).find(w => w.id === activeWorkspaceID)?.name || 'workspace';
    const markdown = buildMoodboardExport(schema, { workspaceID: activeWorkspaceID });
    downloadMoodboard(markdown, `tabyrinth-moodboard-${wsName.replace(/\s+/g, '-')}-${Date.now()}.md`);
  };

  const handleMoodboardExportAll = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    const markdown = buildMoodboardExport(schema);
    downloadMoodboard(markdown, `tabyrinth-moodboard-all-${Date.now()}.md`);
  };

  const handleMoodboardPDFWorkspace = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    await exportMoodboardToPDF(schema, { workspaceID: activeWorkspaceID });
  };

  const handleMoodboardPDFAll = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    await exportMoodboardToPDF(schema);
  };

  // Visual Moodboard export handlers
  const handleVisualExportWorkspace = async (format: 'pdf' | 'image' | 'html') => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    const wsName = (schema.workspaces || []).find(w => w.id === activeWorkspaceID)?.name || 'workspace';
    const units = getMoodboardUnits(activeWorkspaceID);
    const filename = `tabyrinth-visual-moodboard-${wsName.replace(/\s+/g, '-')}-${Date.now()}`;

    if (format === 'pdf') {
      await exportVisualMoodboardToPDF(units, `${wsName} — Visual Moodboard`)
    } else {
      await downloadVisualMoodboardAsHtml(units, `${filename}.html`);
    }
  };

  // Research trail export handlers
  const handleTrailExportWorkspace = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    const wsName = (schema.workspaces || []).find(w => w.id === activeWorkspaceID)?.name || 'workspace';
    const markdown = buildTrailExport(schema, { workspaceID: activeWorkspaceID });
    downloadTrail(markdown, `tabyrinth-trail-${wsName.replace(/\s+/g, '-')}-${Date.now()}.md`);
  };

  const handleTrailExportAll = async () => {
    if (!(await requirePro())) return;
    const schema = await StorageService.get();
    const markdown = buildTrailExport(schema);
    downloadTrail(markdown, `tabyrinth-trail-all-${Date.now()}.md`);
  };

  // client side license key visibility
  const toggleLicenseKeyVisibility = () => {
    setIsKeyVisible(prev => !prev)
  };

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


  // adding items to moodboard
  const prevCountRef = useRef(0);

  useEffect(() => {
    const wasEmpty = prevCountRef.current === 0;
    const isEmpty = moodboardItemCount === 0;

    if (wasEmpty && !isEmpty) {
      setIsMoodboardToggled(true);
    } else if (!wasEmpty && isEmpty) {
      setIsMoodboardToggled(false);
    }
    prevCountRef.current = moodboardItemCount;
  }, [moodboardItemCount]);

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
      const { paymentUrl, provider } = await createCheckoutSession(activationMail);
      chrome.tabs.create({ url: paymentUrl });
      setStatusMessage({
        text: 'Checkout opened. Complete payment to receive your key by email.',
        isError: false,
      });
      console.log("[PURCHASE] provider:", provider);
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

  const MaskedKey = ({ value }: { value: string | null }) => {
    if (!value) return null;

    return (
      <div
        className="flex min-w-0 flex-1 flex-nowrap items-center gap-[3px] overflow-hidden"
        aria-label="Hidden license key">
        {value.split('').map((char, i) =>
          char === '-' ? (
            <span key={i} className="shrink-0 px-1 leading-none text-gray-400 select-none"></span>
          ) : (
            <div key={i} className="w-4 h-3 rounded-xs bg-orange-500" />
          )
        )}
      </div >
    );
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#21252b] text-[#e3e1e5] p-2 text-xs select-none overflow-hidden">

      {/* header */}
      <div className="flex items-center justify-between gap-2 px-2 h-16 min-w-0">
        {isPro ?
          <div className="font-logo text-sm text-gray-200 shrink-0"></div> :
          <div className="font-logo text-lg text-gray-200 shrink-0">Tabyrinth</div>}
        {isPro && (
          <span className="text-2xl text-[#FF6314] ml-4 mb-1 font-bold tracking-wider shrink-0">
            plus
          </span>
        )}

        <div className="flex-1 min-w-0">
          <WorkspaceNotch />
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="inline-flex items-center justify-center whitespace-nowrap 
            text-[15px] leading-none font-bold text-white bg-[#FF6314] 
            px-4 h-8 rounded-2xl shadow-sm shadow-black/30">
            {activeCount}
          </div>

          <button
            onClick={() => { setIsMoodboardToggled(!isMoodboardToggled) }}
            title="Open moodboard"
            className="flex items-center justify-center h-8 w-8 rounded-xl bg-white/10 
            hover:bg-white/20 text-gray-300 hover:text-white transition-colors shrink-0">
            <BookIcon size={18} weight="bold" />
          </button>
        </div>
      </div>

      {/* media card if there is any */}
      <MediaCard />

      {/* tree */}
      {/* add padding after fixing alignment here */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* rendering the board */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out 
            ${isMoodboardActive ? "h-1/2 opacity-100" : "h-0 opacity-0"}`}>
          <Board />
        </div>


        {/* Scrollable list area */}
        <div ref={treeContainerRef} className={`flex-1 mt-3 overflow-y-auto no-scrollbar ${isMoodboardActive ? 'h-1/2' : ''}`}>
          {!regularRootIDs || (regularRootIDs.length === 0 && !cloudHasItems) ? (
            <div className="flex flex-col items-center justify-center m-2">
              <p className="text-gray-400 font-bold text-lg text-center">No active tabs in this workspace</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">

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

          <CloudGroup workspaceID={activeWorkspaceID} isResettingGhosts={isResettingGhosts} />

          {ghostGroup && <GhostGroup group={ghostGroup} isResettingGhosts={isResettingGhosts} />}

          {/* new tab button */}
          <button
            onClick={createNewTab}
            className="flex items-center gap-2.5 h-12 w-full px-2 py-1.5 mt-1 rounded-2xl 
          text-gray-400 hover:text-white hover:bg-white/5 transition-all cursor-pointer 
          group justify-center items-center bg-black/20 border-2 border-white/20 shrink-0 mt-4">
            <div className="w-5 h-5 flex items-center justify-center text-white group-hover:text-gray-300 transition-colors">
              <div className="text-lg font-bold leading-none">
                <PlusIcon size={20} weight='bold' />
              </div>
            </div>
            <span className="text-sm text-white font-medium">New tab</span>
          </button>
        </div>
      </div>

      {/* footer */}
      <div className={`shrink-0 bottom-3 left-3 right-3 grid ${isPro ? 'grid-cols-7' : 'grid-cols-6'} gap-4 items-center justify-center bg-transparent`}>
        {/* search bar */}
        <div className='rounded-full h-10 my-2 py-2 justify-center items-center grid grid-cols-4 col-span-4
        bg-[#21252b] shadow-[inset_9px_9px_18px_#121418,inset_-9px_-9px_18px_#30363e]'>
          <div className='col-span-1 ml-4'><MagnifyingGlassIcon size={24} /></div>
          <div className='flex col-span-3 justify-center'></div>
        </div>

        {/* clear tree button */}
        <button onClick={resetTree} className='flex h-10 rounded-2xl bg-black border-2 border-gray-700 hover:bg-gray-200 hover:text-black
        transition-all ease-in-out duration-300 justify-center items-center'>
          <ArrowClockwiseIcon size={20} />
        </button>

        {isPro && (
          <button onClick={() => setIsStarterPaneOpen(true)} className='flex h-10 rounded-2xl bg-black border-2 border-gray-700 hover:bg-gray-200 hover:text-black
          transition-all ease-in-out duration-300 justify-center items-center' title="Hot Tabs">
            <LightningIcon size={20} weight="fill" />
          </button>
        )}

        {/* settings button */}
        <button onClick={handleOpenSettings} className='flex h-10 rounded-2xl bg-black border-2 border-gray-700 hover:bg-gray-200 hover:text-black
        transition-all ease-in-out duration-300 justify-center items-center'>
          <SlidersHorizontalIcon size={20} weight="fill" />
        </button>
      </div>


      {/* HOT TABS STARTER VIEW */}
      {isPro && isStarterPaneOpen && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-white">Hot Tabs</h2>
            <button
              onClick={() => setIsStarterPaneOpen(false)}
              className="text-gray-400 hover:text-white text-base font-bold px-2"
              aria-label="Close Hot Tabs">
              ✕
            </button>
          </div>

          <button
            onClick={handleCreateHotTabSet}
            className="border-2 border-dashed border-white/25 hover:border-[#FF6314] text-gray-300 
            hover:text-white rounded-2xl p-4 mb-3 text-sm font-bold transition-colors">
            + Create from Current Workspace
          </button>

          <div className="flex flex-col gap-2">
            {Object.values(hotTabs).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No Hot Tab starters yet.</p>
            ) : (
              Object.values(hotTabs).map((hotTabSet) => (

                <div key={hotTabSet.id} className="bg-white/10 border-2 border-gray-700 rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-white truncate">{hotTabSet.name}</h3>
                      <p className="text-sm font-bold text-gray-400">{hotTabSet.items.length} tabs</p>
                    </div>
                    <button
                      onClick={() => void launchHotTabSet(hotTabSet.id)}
                      className="bg-[#FF6314] hover:bg-[#ff742d] text-white font-bold py-2 px-3 rounded-xl text-xs transition-colors">
                      Launch
                    </button>
                  </div>

                  <div className='flex items-center mb-2 gap-1 overflow-hidden'>
                    {hotTabSet.items.slice(0, 8).map((item, idx) => {
                      const iconSrc = item.favIconUrl || `chrome://favicon2/favicons/pageUrl=${encodeURIComponent(item.url)}&size=32`;

                      return (
                        <img
                          key={idx}
                          src={iconSrc}
                          alt=""
                          className='w-5 h-5 rounded-sm object-contain bg-gray-700 mx-[2px] my-1'
                          onError={(e) => {
                            e.currentTarget.style.visibility = 'hidden';
                          }}
                        />
                      );
                    })}
                    {hotTabSet.items.length > 8 && (
                      <span className="text-[10px] text-gray-500 font-mono ml-1">+{hotTabSet.items.length - 8}</span>
                    )}
                  </div>

                  <button
                    onClick={() => void handleDeleteHotTabSet(hotTabSet.id)}
                    className="w-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white font-bold py-2 rounded-xl text-xs transition-colors">
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

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

          {isPro && (
            <>
          {/* export workspace -> MD and PDF */}
          <div className="bg-white/10 rounded-2xl p-4 flex flex-col gap-3 mb-2">
            <span className="font-bold text-sm text-white">Export Notes</span>
            {/* separation */}
            <div className='flex flex-col gap-1.5'>
              <span className="text-gray-300 text-[13px]">Save your tab notes to Markdown</span>
              <div className="flex gap-2">
                <button
                  onClick={handleMarkdownExportWorkspace}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  This workspace
                </button>
                <button
                  onClick={handleMarkdownExportAll}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  All workspaces
                </button>
              </div>
            </div>

            <div className='flex flex-col gap-1.6'>
              <span className="text-gray-400 text-[11px] uppercase tracking-wide">PDF</span>
              <div className="flex gap-2">
                <button
                  onClick={handlePDFExportWorkspace}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  This workspace
                </button>
                <button
                  onClick={handlePDFExportAll}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  All workspaces
                </button>
              </div>
              <span className="text-gray-500 text-[10px]">Save notes to PDF</span>
            </div>
          </div>

          {/* export moodboard -> MD and PDF */}
          <div className="bg-white/10 rounded-2xl p-4 flex flex-col gap-3 mb-2">
            <span className="font-bold text-sm text-white">Export Moodboard</span>

            <div className='flex flex-col gap-1.5'>
              <span className="text-gray-300 text-[13px]">Save moodboard items to Markdown</span>
              <div className="flex gap-2">
                <button
                  onClick={handleMoodboardExportWorkspace}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  This workspace
                </button>
                <button
                  onClick={handleMoodboardExportAll}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  All workspaces
                </button>
              </div>
            </div>

            <div className='flex flex-col gap-1.6'>
              <span className="text-gray-400 text-[11px] uppercase tracking-wide">PDF</span>
              <div className="flex gap-2">
                <button
                  onClick={handleMoodboardPDFWorkspace}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  This workspace
                </button>
                <button
                  onClick={handleMoodboardPDFAll}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  All workspaces
                </button>
              </div>
              <span className="text-gray-500 text-[10px]">Save moodboard to PDF</span>
            </div>

            <div className='flex flex-col gap-1.6 mt-2 pt-2 border-t border-white/10'>
              <span className="text-gray-400 text-[11px] uppercase tracking-wide">Visual Export (As Is)</span>
              <div className="flex gap-2">
                <button
                  onClick={() => handleVisualExportWorkspace('pdf')}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  PDF
                </button>
                <button
                  onClick={() => handleVisualExportWorkspace('html')}
                  className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                  HTML
                </button>
              </div>
              <span className="text-gray-500 text-[10px]">Export masonry layout</span>
            </div>
          </div>

          <div className="bg-white/10 rounded-2xl p-4 flex flex-col gap-3 mb-2">
            <span className="font-bold text-sm text-white">Export Citations</span>
            <span className="text-gray-300 text-[13px]">
              Turn tabs into APA, IEEE, or BibTeX references.
            </span>
            <button
              onClick={() => setIsCitationPanelOpen(true)}
              className="bg-[#FF6314] hover:bg-[#ff742d] text-white font-bold py-2 rounded-xl text-xs transition-colors">
              Open citation panel
            </button>
          </div>

          <div className="bg-white/10 rounded-2xl p-4 flex flex-col gap-3 mb-2">
            <span className="font-bold text-sm text-white">Export Research Trail</span>
            <span className="text-gray-300 text-[13px]">
              Save the full nested tab tree as Markdown — a trace of how this session unfolded.
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleTrailExportWorkspace}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                This workspace
              </button>
              <button
                onClick={handleTrailExportAll}
                className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2 rounded-xl text-xs transition-colors">
                All workspaces
              </button>
            </div>
          </div>
            </>
          )}


          {statusMessage && (
            <div className={`p-2.5 rounded-xl text-xs mb-3 ${statusMessage.isError ? 'bg-red-600 text-white font-bold text-[14px]'
              : 'bg-green-600 text-white font-bold text-[14px]'}`}>
              {statusMessage.text.toUpperCase()}
            </div>
          )}

          {isPro ? (
            <div className="bg-white/5 border border-white/2 rounded-2xl p-4 flex flex-col gap-2">
              <div className="text-sm text-gray-400">Plus License Active</div>
              <div className="flex items-center gap-3">
                <div className="flex min-w-0 flex-1 items-center">
                  {isKeyVisible ? (
                    <span className="truncate text-xl text-orange-500 font-bold">{activeKey}</span>
                  ) : (
                    <MaskedKey value={activeKey} />
                  )}
                </div >

                <button onClick={() => setIsKeyVisible(v => !v)} className="flex w-8 h-8 justify-end items-center shrink-0">
                  {isKeyVisible ? <div className='bg-white/10 p-2 rounded-xl text-orange-500 hover:bg-white/20'><EyeClosedIcon size={16} weight='bold' /></div> :
                    <div className='bg-white/10 p-2 rounded-xl text-orange-500 hover:bg-white/20'><EyeIcon size={16} weight='bold' /></div>}
                </button>
              </div>
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
      )
      }
      {isPro && isCitationPanelOpen && (
        <CitationExportPanel onClose={() => setIsCitationPanelOpen(false)} />
      )}

    </div >
  );
}