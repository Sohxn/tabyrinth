import React, { useState, type SyntheticEvent } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { StorageService } from '@/src/services/storage';
import { type TabNode } from '@/src/types';
import { PencilSimpleIcon, CaretCircleDownIcon, CaretCircleRightIcon } from '@phosphor-icons/react';

interface TreeNodeProps {
  nodeID: string | number;
  depth: number;
  isResettingGhosts?: boolean;
}

export function TreeNode({ nodeID, depth, isResettingGhosts = false }: TreeNodeProps) {
  const node = useTreeStore((state) => state.nodes[nodeID]);
  const expandedNodes = useTreeStore((state) => state.expandedNodeIDs);
  const toggleExpand = useTreeStore((state) => state.toggleExpand);
  const focusTab = useTreeStore((state) => state.focusTab);
  const closeTab = useTreeStore((state) => state.closeTab);
  const lastActiveTabID = useTreeStore((state) => state.lastActiveTabID);

  const [showNotes, setShowNotes] = useState(false);
  const [newNoteInput, setNewNoteInput] = useState('');
  const [isHovered, setIsHovered] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  if (!node) return null;

  // status flags
  const isExpanded = expandedNodes[nodeID] ?? true;
  const hasChildren = node.childrenIDs && node.childrenIDs.length > 0;
  const isActive = lastActiveTabID == node.id;

  // notes related
  const notesCount = node.notes?.length ?? 0;

  // animation related
  const isSlidingOut = isClosing || (node.isClosed && isResettingGhosts)

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

  // reopen closed tabs (history)
  // ** race condtion: fixed 
  //** fix: call from background worker instead of direct call
  const handleTabClick = async (e: React.MouseEvent) => {
    e.stopPropagation();

    if (node.isClosed) {
      await chrome.runtime.sendMessage({
        type: 'reopen-node',
        nodeID: node.id
      });
    } else {
      await chrome.tabs.update(Number(node.id), { active: true });
      await chrome.windows.update(node.windowID, { focused: true });
    }
  };

  // add manual note
  const handleManualNoteToTab = async (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newNoteInput.trim()) return;
    await StorageService.addNoteToTab(node.id, newNoteInput);
    setNewNoteInput('');
  };

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

      <div onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={handleTabClick}
        style={{ marginLeft: (depth === 0 || isActive || !hasChildren) ? 0 : `${depth * 16 + 9}px` }}
        className={`group relative flex items-center h-12 pr-1 my-[1px] rounded-2xl 
            text-xs cursor-pointer transition-colors border-2 border-[#333333] 
            ${isActive ? 'bg-[#3c516f] text-bold font-medium' : node.isClosed
            ? 'bg-black text-white opacity-40'
            : 'text-white bg-black bg-hover:bg-[#3b3b3b]'
          }`}>

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
        {node.favIconURL ? (
          <img src={node.favIconURL} alt="" className="w-4 h-4 rounded-sm mr-2 flex-shrink-0" />
        ) : (
          <div className="w-4 h-4 rounded-sm bg-gray-600 mr-2 flex-shrink-0" />
        )}

        <span className={`truncate flex-1 ${node.isClosed ? 'text-gray-200' : 'text-white text-[14px]'}`}>
          {node.title || 'New Tab'}
        </span>

        {/* interaction badges */}
        <div className='right-1 flex items-center gap-1'>
          {/* note badge */}
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
        </div>
      </div>

      {/* Expandable Tab Notepad Drawer */}
      {showNotes && (
        <div className="my-2 p-2 bg-gray-900 rounded-xl text-xs space-y-4 transition-all">
          <div className="flex items-center justify-between text-[11px] text-white font-semibold pb-2">
            <span>Tab Notepad</span>
            <span className="text-[10px] text-gray-500">{notesCount} saved</span>
          </div>

          {notesCount > 0 ? (
            <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
              {node.notes?.map((note) => (
                <div key={note.id} className="group/note relative bg-[#231834] p-2 rounded-lg border border-[#3d2b56] text-[11px] text-gray-200">
                  <p className="whitespace-pre-wrap break-words pr-4">{note.content}</p>
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
            <p className="text-[14px] font-bold text-gray-300 p-2">No notes yet. Highlight text & right-click to add.</p>
          )}

          <form onSubmit={handleManualNoteToTab} className="flex gap-1 pt-1">
            <input
              type="text"
              value={newNoteInput}
              onChange={(e) => setNewNoteInput(e.target.value)}
              placeholder="Type a quick note..."
              className="flex-1 mr-2 bg-black rounded-lg px-2 py-1 h-8 text-[11px] text-gray-200"
            />
            <button
              type="submit"
              className="px-2 py-1 bg-orange-500 hover:bg-orange-700 h-8 text-white rounded-lg text-[10px] font-medium transition-colors">
              Add
            </button>
          </form>
        </div>
      )}

      {/* children — normal folding, no stack collapsing */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col transition-all duration-300 ease-in-out">
          {node.childrenIDs.map((childID) => (
            <TreeNode key={childID} nodeID={childID} depth={depth + 1} isResettingGhosts={isResettingGhosts} />
          ))}
        </div>
      )}
    </div>
  );
}