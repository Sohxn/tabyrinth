import React, { useState, type SyntheticEvent, useRef, useEffect } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { StorageService } from '@/src/services/storage';
import { isProActive } from '@/src/services/sync';
import { createPortal } from 'react-dom';
import { sanitizeHTML } from '@/src/utils/sanitizeHTML';
import { type TabNode } from '@/src/types';
import { PencilSimpleIcon, CaretCircleRightIcon, CodeBlockIcon } from '@phosphor-icons/react'; // Assuming CodeBlockIcon exists or can be replaced
import { smartTextToHTML, escapeHTML } from '@/src/utils/noteText';

interface TreeNodeProps {
  nodeID: string | number;
  depth: number;
  isResettingGhosts?: boolean;
  isChainContinuation?: boolean;
}

const CHAIN_THRESHOLD = 4;

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

  const inputRef = useRef<HTMLDivElement>(null);

  if (!node) return null;

  const hasChildren = node.childrenIDs && node.childrenIDs.length > 0;
  const isChainFoldCandidate = !isChainContinuation && chainLen > CHAIN_THRESHOLD;
  const isExpanded = expandedNodes[nodeID] ?? (isChainFoldCandidate ? false : true);
  const isFoldedChain = isChainFoldCandidate && !isExpanded;

  const displayNode = isFoldedChain ? getChainDisplayNode(nodeID, useTreeStore.getState().nodes, lastActiveTabID) ?? node : node;
  const isActive = isFoldedChain ? displayNode.id == lastActiveTabID : lastActiveTabID == node.id;

  const notesCount = node.notes?.length ?? 0;
  const isSlidingOut = isClosing || (node.isClosed && isResettingGhosts)
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

    if (target.isRemote && !(await isProActive())) return;

    if (target.isClosed) {
      await chrome.runtime.sendMessage({ type: 'reopen-node', nodeID: target.id });
      return;
    }

    try {
      await chrome.tabs.update(Number(target.id), { active: true });
      await chrome.windows.update(target.windowID, { focused: true });
    } catch {
      // No live tab exists locally for this node — it most likely arrived via
      // sync from another device whose session ended with this tab open.
      // Treat it as a reopen request.
      await chrome.runtime.sendMessage({ type: 'reopen-node', nodeID: target.id });
    }
  };

  const handleManualNoteToTab = async (e: SyntheticEvent) => {
    e.preventDefault();
    const content = inputRef.current?.innerText || '';
    if (!content.trim()) return;

    // Manual input is treated as plain text and passed to the smart builder
    const htmlToSave = smartTextToHTML(content);
    await StorageService.addNoteToTab(node.id, htmlToSave);

    if (inputRef.current) inputRef.current.innerText = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const html = e.clipboardData.getData('text/html');
    const text = e.clipboardData.getData('text/plain');

    if (html && (html.includes('<pre') || html.includes('<code'))) {
      // Preserve structured code from clipboard, but sanitize it
      const sanitized = sanitizeHTML(html);
      document.execCommand('insertHTML', false, sanitized);
      e.preventDefault();
    }
    // Otherwise, let the browser handle the plain text paste
  };

  const toggleCodeBlock = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const selectedText = range.toString();

    if (selectedText) {
      const codeElement = document.createElement('pre');
      const codeInner = document.createElement('code');
      codeInner.innerText = selectedText;
      codeElement.appendChild(codeInner);

      range.deleteContents();
      range.insertNode(codeElement);
    }
  };

  const notesOverlay = showNotes ?
    createPortal(
      <div
        onClick={() => setShowNotes(false)}
        className="fixed inset-0 top-0 z-[100] p-4 flex items-start justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md flex flex-col gap-2 max-h-[80vh] animate-in slide-in-from-bottom duration-200">

          <div className="flex items-center justify-between bg-[#181a1f] border border-white/15 rounded-2xl px-4 py-3 shadow-lg shrink-0">
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

          <div className="bg-[#181a1f] border border-white/15 rounded-3xl p-3 shadow-2xl flex flex-col gap-3 flex-1 min-h-0">
            {notesCount > 0 ? (
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
                {node.notes?.map((note) => (
                  <div key={note.id} className="group/note relative bg-black p-4 mb-4 border-2 border-white/30 rounded-xl text-[16px] text-gray-200">
                    <div
                      className="whitespace-pre-wrap break-words pr-4 overflow-x-auto no-scrollbar"
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

            <div className="flex flex-col gap-2 pt-1 shrink-0">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={toggleCodeBlock}
                  className="px-2 py-1 bg-gray-700 hover:bg-gray-600 h-8 text-white rounded-lg text-[12px] font-bold transition-colors flex items-center gap-1">
                  <CodeBlockIcon size={14} /> Code
                </button>
              </div>
              <div className="flex gap-1">
                <div
                  ref={inputRef}
                  contentEditable
                  onPaste={handlePaste}
                  className="flex-1 bg-black rounded-xl px-2 py-1 min-h-[40px] max-h-[150px] overflow-y-auto text-[14px] text-white outline-none border border-transparent focus:border-orange-500/50"
                  data-placeholder="Type a quick note..." />
                <button
                  onClick={handleManualNoteToTab}
                  className="px-2 py-1 bg-orange-500 hover:bg-orange-700 h-9 text-white rounded-lg text-[14px] font-bold transition-colors">
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>,
      document.body) : null;

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

      {isChainFoldCandidate && (
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isFoldedChain ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
            }`}>
          <div style={{ marginLeft: rowMarginLeft }} className="overflow-hidden pointer-events-none">
            <div className="h-2 mx-3 rounded-t-2xl border-2 border-b-0 border-[#333333] bg-[#141518] opacity-70" />
            <div className="h-2 mx-1.5 rounded-t-2xl border-2 border-b-0 border-[#333333] bg-[#1c1d21] opacity-90 -mt-1" />
          </div>
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

      {hasChildren && (
        <div
          className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className="overflow-hidden flex flex-col">
            {node.childrenIDs.map((childID) => (
              <TreeNode
                key={childID}
                nodeID={childID}
                depth={depth + 1}
                isResettingGhosts={isResettingGhosts}
                isChainContinuation={node.childrenIDs.length === 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
