import React, { type SyntheticEvent } from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { StorageService } from '@/src/services/storage';
import { type TabNode } from '@/src/types';
import {PencilCircleIcon, PencilSimpleIcon} from '@phosphor-icons/react';

interface TreeNodeProps {
    nodeID: string | number;
    depth: number;
}

//finds the deepest leaf in a subtree
function getDeepestLeafNode(startNode: TabNode, nodes: Record<string | number, TabNode>): {leaf: TabNode; hiddenCount: number}{
  let current = startNode;
  let hiddenCount = 0;

  while(current.childrenIDs && current.childrenIDs.length > 0){
    const lastChildID = current.childrenIDs[current.childrenIDs.length - 1];
    if(lastChildID === undefined || lastChildID === null || !nodes[lastChildID]) break;
      if(!nodes[lastChildID]) break; 
      current = nodes[lastChildID];
      hiddenCount++;
  }
  return {
    leaf: current,
    hiddenCount
  };
}

function getChainLength(node: TabNode, nodes: Record<string | number, TabNode>): number{
  let length = 0;
  let current = node;
  while(current.childrenIDs && current.childrenIDs.length > 0){
    const lastChildID = current.childrenIDs[current.childrenIDs.length - 1];
    if(lastChildID === undefined || lastChildID === null || !nodes[lastChildID]) break;
    current = nodes[lastChildID];
    length++;
  }

  return length;
}

export function TreeNode({nodeID, depth}: TreeNodeProps) {
    const node = useTreeStore((state) => state.nodes[nodeID]);
    const nodes = useTreeStore((state) => state.nodes);
    const expandedNodes = useTreeStore((state) => state.expandedNodeIDs);
    const expandedStackIDs = useTreeStore((state) => state.expandedStackIDs);
    const toggleExpand = useTreeStore((state) => state.toggleExpand);
    const toggleStackExpand = useTreeStore((state) => state.toggleStackExpand);
    const focusTab = useTreeStore((state) => state.focusTab);
    const closeTab = useTreeStore((state) => state.closeTab);
    const lastActiveTabID = useTreeStore((state) => state.lastActiveTabID);
    const [showNotes, setShowNotes] = useState(false);
    const [newNoteInput, setNewNoteInput] = useState('');
    const [isHovered, setIsHovered] = useState(false);
    

    

    if(!node) return null;

    // status flags
    const isExpanded = expandedNodes[nodeID] ?? true;
    const isStackExpanded = expandedStackIDs[nodeID] ?? false;
    const hasChildren = node.childrenIDs && node.childrenIDs.length > 0;
    const isActive = lastActiveTabID == node.id;
    const STACK_THRESHOLD = 5;
    const chainLength = hasChildren ? getChainLength(node, nodes) : 0;

    // notes related
    const notesCount = node.notes?.length ?? 0;


    // if depth exceeds 5 collapse to stacked tabs
    const exceedsDepthLimit = depth >= 5;
    const shouldCollapseStack = (exceedsDepthLimit || chainLength >= STACK_THRESHOLD) && !isStackExpanded;
  
    const {leaf: leafNode, hiddenCount} = shouldCollapseStack ? 
    getDeepestLeafNode(node, nodes) : {leaf: null, hiddenCount: 0};

    // reopen closed tabs (history)
    const handleTabClick = async (e: React.MouseEvent) => {
      e.stopPropagation();

      if(node.isClosed){
        await StorageService.reopenNode(node.id);
      }else{
        await chrome.tabs.update(Number(node.id), { active: true });
        await chrome.windows.update(node.windowID, { focused: true });
      }
    };

    // add manual note
    const handleManualNoteToTab = async (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      if(!newNoteInput.trim()) return;
      await StorageService.addNoteToTab(node.id, newNoteInput);
      setNewNoteInput('');
    };


    return(
    <div className="relative flex-col w-full">
      {depth > 0 && !shouldCollapseStack && (
        <div
          className="absolute top-0 bottom-0 border-l border-[#362e3d]"
          style={{ left: `${depth * 14 - 2}px` }}
        />
      )}
      
      {!shouldCollapseStack && (
        <div onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handleTabClick}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`group relative flex items-center h-10 pr-2 my-[1px] rounded-2xl text-xs cursor-pointer transition-colors border-2 border-[#333333] ${
            isActive
              ? 'border-2 border-white text-white font-medium'
              : node.isClosed
              ? 'bg-transparent text-gray-500 opacity-50'
              : 'text-[#e3e1e5] hover:bg-[#3b3b3b]'
          }`}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpand(node.id);
            }}
            className={`w-4 h-4 flex items-center justify-center rounded hover:bg-[#483a54] mr-1 ${
              hasChildren ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}>
            <span
              className={`text-[9px] text-gray-400 transition-transform duration-150 inline-block ${
                isExpanded ? 'rotate-90' : ''
              }`}>
              ▶
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
          
          {!node.isClosed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(node.id);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#483a54] text-gray-400 hover:text-white">
              ✕
            </button>
          )}

          {/* note badge */}
          {notesCount > 0 ?
            // condition: has notes 
            (
              <>
                <button onClick={(e) => {
                  e.stopPropagation();
                  setShowNotes((prev) => !prev);
                }} className='absolute right-1 px-1.5
                  py-0.5 rounded-full h-6 w-6 bg-white flex gap-1
                  text-center justify-center items-center'>
                  <span className='text-black text-md font-bold'>{notesCount}</span>
                </button>

                {/* only show edit if hovered */}
                {isHovered && (
                  <button onClick={(e) => {
                    e.stopPropagation();
                    setShowNotes((prev) => (!prev));
                  }}
                  className='relative mr-5 right-1 px-1.5
                  py-0.5 rounded-full h-6 w-6 bg-white flex gap-1
                  text-center justify-center items-center '>
                    <PencilSimpleIcon className='text-black' size={40}/>
                  </button>
                )}
              </>
            ) : 

          // conditon: no notes
            (isHovered && 
              (
              <button onClick={(e) => {
                  e.stopPropagation();
                  setShowNotes((prev) => !prev);
                }} className='relative right-1 px-1.5
                  py-0.5 rounded-full h-6 w-6 bg-white flex gap-1
                  text-center justify-center items-center '>
                  <span className='text-black text-md font-bold'>
                    <PencilSimpleIcon className='text-black'/>
                  </span>
              </button>
              )  
            )
          }
        </div>
      )}

    {/* Expandable Tab Notepad Drawer */}
    {showNotes && (
      <div 
        style={{ marginLeft: `${depth * 14 + 24}px` }}
        className="my-1.5 p-2 bg-[#181124] border border-[#3c2a52] rounded-xl text-xs space-y-2 transition-all"
      >
        <div className="flex items-center justify-between text-[11px] text-purple-300 font-semibold border-b border-[#2d203f] pb-1">
          <span>Tab Notepad</span>
          <span className="text-[10px] text-gray-500">{notesCount} saved</span>
        </div>

        {/* Note List */}
        {notesCount > 0 ? (
          <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 no-scrollbar">
            {node.notes?.map((note) => (
              <div key={note.id} className="group/note relative bg-[#231834] p-2 rounded-lg border border-[#3d2b56] text-[11px] text-gray-200">
                <p className="whitespace-pre-wrap break-words pr-4">{note.content}</p>
                <button
                  onClick={() => StorageService.deleteNoteFromTab(node.id, note.id)}
                  className="absolute top-1 right-1 opacity-0 group-hover/note:opacity-100 text-gray-400 hover:text-red-400 p-0.5 text-[9px]"
                  title="Delete note"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-gray-500 italic">No notes yet. Highlight text & right-click to add.</p>
        )}

        {/* Manual Input Form */}
        <form onSubmit={handleManualNoteToTab} className="flex gap-1 pt-1">
          <input
            type="text"
            value={newNoteInput}
            onChange={(e) => setNewNoteInput(e.target.value)}
            placeholder="Type a quick note..."
            className="flex-1 bg-[#0d0716] border border-[#3b2b4f] rounded-lg px-2 py-1 text-[11px] text-gray-200 focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            className="px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-[10px] font-medium transition-colors"
          >
            Add
          </button>
        </form>
      </div>
    )}

    {/* card stack */}
    {hasChildren && isExpanded && (
      shouldCollapseStack ? (
        leafNode && (
          <div 
            className="relative my-2 transition-all duration-300 ease-in-out" 
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {/* Background stack visual effect layers */}
            <div className="absolute inset-x-2 -bottom-1 h-8 bg-[#2d2138] border border-[#4a3b59] rounded-2xl opacity-60 scale-[0.96] pointer-events-none" />
            <div className="absolute inset-x-2 -bottom-2 h-8 bg-[#1f1528] border border-[#362744] rounded-2xl opacity-30 scale-[0.92] pointer-events-none" />

            {/* Leaf node interactive card */}
            <div
              onClick={(e) => { e.stopPropagation(); focusTab(leafNode.id); }}
              className={`group relative z-10 flex items-center h-10 px-3 rounded-2xl text-xs cursor-pointer transition-colors border border-[#4a3b59] ${
                lastActiveTabID == leafNode.id
                  ? 'bg-[#6E92BF] text-white font-medium border-transparent'
                  : 'bg-[#21172a] text-[#e3e1e5] hover:bg-[#31233e]'
              }`}
            >
              {leafNode.favIconURL ? (
                <img src={leafNode.favIconURL} alt="" className="w-4 h-4 rounded-sm mr-2 flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-sm bg-gray-600 mr-2 flex-shrink-0" />
              )}
              <span className="truncate flex-1 font-medium">{leafNode.title || 'New Tab'}</span>

              {/* Hidden count badge */}
              {hiddenCount > 0 && (
                <span className="text-[10px] text-purple-300 bg-purple-950/80 border border-purple-600/40 px-1.5 py-0.5 rounded-md mr-2 font-mono">
                  +{hiddenCount}
                </span>
              )}

              {/* Expand stack button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleStackExpand(node.id);
                }}
                className="px-2 py-1 text-[10px] bg-purple-800/60 hover:bg-purple-600 text-purple-100 font-semibold rounded-lg border border-purple-400/40 transition-colors shrink-0"
                title="Expand subtree stack"
              >
                Expand
              </button>
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col transition-all duration-300 ease-in-out">
          {node.childrenIDs.map((childID) => (
            <TreeNode key={childID} nodeID={childID} depth={depth + 1} />
          ))}
        </div>
      )
    )}

  </div>
  );
}