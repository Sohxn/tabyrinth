import React, { useState, type SyntheticEvent } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { StorageService } from '@/src/services/storage';
import { createPortal } from 'react-dom';
import { sanitizeHTML } from '@/src/utils/sanitizeHTML';
import { type TabNode } from '@/src/types';
import { PencilSimpleIcon, CaretCircleRightIcon } from '@phosphor-icons/react';

interface TreeNodeProps {
  nodeID: string | number;
  depth: number;
  isResettingGhosts?: boolean;
  isChainContinuation?: boolean;
}

const CHAIN_THRESHOLD = 4;

//**todo: split if needed
function getChainLength(startID: string | number, nodes: Record<string | number, TabNode>): number {
  let len = 0;
  let currID: string | number | undefined = startID;

  while (currID !== undefined) {
    const currNode: TabNode | undefined = nodes[currID];
    if (!currNode) break;
    len++;
    currID = currNode.childrenIDs.length === 1 ? currNode.childrenIDs[0] : undefined;
  }

  return len;
}

function getChainDisplayNode(
  startID: string | number,
  nodes: Record<string | number, TabNode>,
  lastActiveTabID: number | null
): TabNode | undefined {
  let current: TabNode | undefined = nodes[startID];
  let leafNode = current;

  while (current) {
    if (current.id == lastActiveTabID) return current;
    leafNode = current;

    const onlyChildID = current.childrenIDs.length === 1 ? current.childrenIDs[0] : undefined;
    current = onlyChildID !== undefined ? nodes[onlyChildID] : undefined;
  }

  return leafNode;
}

export function TreeNode({ nodeID, depth, isResettingGhosts = false, isChainContinuation = false }: TreeNodeProps) {
  const node = useTreeStore((state) => state.nodes[nodeID]);
  const expandedNodes = useTreeStore((state) => state.expandedNodeIDs);
  const toggleExpand = useTreeStore((state) => state.toggleExpand);
  const focusTab = useTreeStore((state) => state.focusTab);
  const closeTab = useTreeStore((state) => state.closeTab);
  const lastActiveTabID = useTreeStore((state) => state.lastActiveTabID);

  const chainLen = useTreeStore((state) =>
    isChainContinuation ? 1 : getChainLength(nodeID, state.nodes)
  );

  const [showNotes, setShowNotes] = useState(false);
  const [newNoteInput, setNewNoteInput] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  if (!node) return null;

  // status flags
  const hasChildren = node.childrenIDs && node.childrenIDs.length > 0;
  const isChainFoldCandidate = !isChainContinuation && chainLen > CHAIN_THRESHOLD;
  const isExpanded = expandedNodes[nodeID] ?? !isChainFoldCandidate;
  const isFoldedChain = isChainFoldCandidate && !isExpanded;

  const displayNode = isFoldedChain ? getChainDisplayNode(nodeID, useTreeStore.getState().nodes, lastActiveTabID) ?? node : node;
  const isActive = isFoldedChain ? displayNode.id == lastActiveTabID : lastActiveTabID == node.id;


  // notes related
  const notesCount = node.notes?.length ?? 0;

  // animation related
  const isSlidingOut = isClosing || (node.isClosed && isResettingGhosts)

  // CHANGED: extracted so the deck-of-cards preview below can share it
  const rowMarginLeft = (depth === 0 || isActive || !hasChildren) ? 0 : `${depth * 16 + 9}px`;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', String(nodeID));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsClosing(true);
    setTimeout(() => {
      closeTab(node.id);
    }, 300);
  }

  const handleTabClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const target = isFoldedChain ? displayNode : node;

    if (target.isClosed) {
      await chrome.runtime.sendMessage({ type: 'reopen-node', nodeID: target.id });
    } else {
      await chrome.tabs.update(Number(target.id), { active: true });
      await chrome.windows.update(target.windowID, { focused: true });
    }
  };

  const handleManualNoteToTab = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newNoteInput.trim()) return;
    await StorageService.addNoteToTab(node.id, newNoteInput);
    setNewNoteInput('');
  };


  // overlay: notes in focus 
  const notesOverlay = showNotes ? createPortal(
    <div
      onClick={() => setShowNotes(false)}
      className="fixed inset-0 top-0 z-[100] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[#181a1f] border border-white/15 
        rounded-t-3xl p-3 shadow-2xl flex flex-col gap-3 max-h-[80vh] animate-in slide-in-from-bottom duration-200">
        {/* CHANGED: header now shows "Notes for" + tab title instead of the
            old generic "Tab Notepad" label, per the reference-name request */}
        <div className="flex items-center justify-between px-1 pb-2 border-b border-white/10">
          <div className="flex flex-col overflow-hidden">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Notes for</span>
            <span className="text-xs font-semibold text-gray-200 truncate max-w-[260px]">
              {node.title || 'New Tab'}
            </span>
          </div>
          <button
            onClick={() => setShowNotes(false)}
            className="text-gray-400 hover:text-white text-sm font-bold px-2 shrink-0">
            ✕
          </button>
        </div>

        {notesCount > 0 ? (
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
            {node.notes?.map((note) => (
              <div key={note.id} className="group/note relative bg-black p-4 mb-4 border-2 border-white/30 rounded-xl text-[16px] text-gray-200">
                {/* unchanged: still using your existing sanitizeHTML + dangerouslySetInnerHTML pattern */}
                <div
                  className="whitespace-pre-wrap break-words pr-4"
                  dangerouslySetInnerHTML={{ __html: sanitizeHTML(note.content) }} />
                <button
                  onClick={() => StorageService.deleteNoteFromTab(node.id, note.id)}
                  className="absolute top-1 right-1 opacity-0 group-hover/note:opacity-100 text-gray-400 hover:text-red-400 p-0.5 text-[9px]"
                  title="Delete note">
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] font-bold text-gray-400 p-2">No notes yet. Highlight text & right-click to add.</p>
        )}

        <form onSubmit={handleManualNoteToTab} className="flex gap-1 pt-1 shrink-0">
          <input
            type="text"
            value={newNoteInput}
            onChange={(e) => setNewNoteInput(e.target.value)}
            placeholder="Type a quick note..."
            className="flex-1 mr-2 bg-black rounded-xl px-2 py-1 h-10 text-[14px] text-white" />

          <button
            type="submit"
            className="px-2 py-1 bg-orange-500 hover:bg-orange-700 h-9 text-white rounded-lg text-[14px] font-bold transition-colors">
            Add
          </button>

        </form>
      </div>
    </div>,
    document.body) : null;


  // main render
  return (
    <div draggable={depth === 0}
      onDragStart={handleDragStart}
      className={`relative flex-col
    transition-all duration-300 ease-in-out transform 
    ${isSlidingOut ? 'translate-x-full opacity-0 pointer-events-none' : 'translate-x-0 opacity-100'}`}>
      {depth > 0 && (
        <div
          className="absolute top-1 bottom-14 border-l border-8 border-[#333333] bg-black rounded-2xl"
          style={{
            marginLeft: `${depth * 16 - 9}px`,
          }}
        />
      )}

      {/* CHANGED: deck-of-cards preview — 2 peeking layers + the row itself = 3 */}
      {isFoldedChain && (
        <div style={{ marginLeft: rowMarginLeft }} className="pointer-events-none">
          <div className="h-2 mx-3 rounded-t-2xl border-2 border-b-0 border-[#333333] bg-[#141518] opacity-70" />
          <div className="h-2 mx-1.5 rounded-t-2xl border-2 border-b-0 border-[#333333] bg-[#1c1d21] opacity-90 -mt-1" />
        </div>
      )}

      <div onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleTabClick}
        style={{ marginLeft: rowMarginLeft }}
        className={`group relative flex items-center h-12 pr-1 my-[1px] rounded-2xl 
            text-xs cursor-pointer transition-colors border-2 border-[#333333] 
            ${isActive ? 'bg-[#3c516f] text-bold font-medium' : displayNode.isClosed
            ? 'bg-black text-white opacity-40'
            : 'text-white bg-black bg-hover:bg-[#3b3b3b]'}`}>

        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleExpand(node.id);
          }}

          className={`flex items-center justify-center rounded hover:bg-[#483a54] ml-3 mr-3 ${hasChildren ? 'opacity-100 w-4 h-4' : 'opacity-0 pointer-events-none w-0 h-0'}`}>
          <span
            className={`text-[9px] text-gray-400 transition-transform duration-150 inline-block ${isExpanded ? 'rotate-90' : ''}`}>
            <CaretCircleRightIcon size={24} />
          </span>
        </button>
        {displayNode.favIconURL ? (
          <img src={displayNode.favIconURL} alt="" className="w-4 h-4 rounded-sm mr-2 flex-shrink-0" />
        ) : (
          <div className="w-4 h-4 rounded-sm bg-gray-600 mr-2 flex-shrink-0" />
        )}

        <span className={`truncate flex-1 ${displayNode.isClosed ? 'text-gray-200' : 'text-white text-[14px]'}`}>
          {displayNode.title || 'New Tab'}
        </span>

        <div className='right-1 flex items-center gap-1'>
          {isFoldedChain ? (
            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-gray-400 font-mono">
              {chainLen}
            </span>
          ) : (
            <>
              {notesCount > 0 ?
                (
                  <>
                    {isHovered && (
                      <button onClick={(e) => {
                        e.stopPropagation();
                        setShowNotes((prev) => (!prev));
                      }}
                        className='px-1.5
                    py-0.5 rounded-full h-6 w-6 bg-white flex
                    text-center justify-center items-center '>
                        <PencilSimpleIcon className='text-black' size={40} />
                      </button>
                    )}

                    <button onClick={(e) => {
                      e.stopPropagation();
                      setShowNotes((prev) => !prev);
                    }} className='px-1.5
                    py-0.5 rounded-full h-6 w-6 bg-white flex
                    text-center justify-center items-center'>
                      <span className='text-black text-md font-bold'>{notesCount}</span>
                    </button>
                  </>
                ) :
                (isHovered &&
                  (
                    <button onClick={(e) => {
                      e.stopPropagation();
                      setShowNotes((prev) => !prev);
                    }} className='px-1.5
                    py-0.5 rounded-full h-6 w-6 bg-white flex
                    text-center justify-center items-center '>
                      <span className='text-black text-md font-bold'>
                        <PencilSimpleIcon className='text-black' />
                      </span>
                    </button>
                  )
                )
              }

              {!node.isClosed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTab(node.id);
                  }}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-[#483a54] text-white font-bold hover:text-white">
                  ✕
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {notesOverlay}

      {hasChildren && isExpanded && (
        <div className="flex flex-col transition-all duration-300 ease-in-out">
          {node.childrenIDs.map((childID) => (
            <TreeNode
              key={childID}
              nodeID={childID}
              depth={depth + 1}
              isResettingGhosts={isResettingGhosts}
              isChainContinuation={node.childrenIDs.length === 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}