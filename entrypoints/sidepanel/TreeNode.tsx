import React from 'react';
import { useTreeStore } from '../../src/store/useTreeStore';
import { StorageService } from '@/src/services/storage';

interface TreeNodeProps {
    nodeID: string | number;
    depth: number;
}

export function TreeNode({nodeID, depth}: TreeNodeProps) {
    const node = useTreeStore((state) => state.nodes[nodeID]);
    const expandedNodes = useTreeStore((state) => state.expandedNodeIDs);
    const toggleExpand = useTreeStore((state) => state.toggleExpand);
    const focusTab = useTreeStore((state) => state.focusTab);
    const closeTab = useTreeStore((state) => state.closeTab);
    const lastActiveTabID = useTreeStore((state) => state.lastActiveTabID);

    if(!node) return null;

    // status flags
    const isExpanded = expandedNodes[nodeID] ?? true;
    const hasChildren = node.childrenIDs && node.childrenIDs.length > 0;
    const isActive = lastActiveTabID == node.id;

    // reopen closed tabs (history)
    const handleTabClick = async (e: React.MouseEvent) => {
      e.stopPropagation();

      if(node.isClosed){
        await StorageService.reopenNode(node.id);
      }else{
        await chrome.tabs.update(Number(node.id), { active: true });
        await chrome.windows.update(node.windowID, { focused: true });
      }
    }

    return(
      <div className="relative flex-col w-full">
        {depth > 0 && (
          <div
            className="absolute top-0 bottom-0 border-l border-[#362e3d]"
            style={{ left: `${depth * 14 - 2}px` }}
          />
        )}
      <div
        onClick={handleTabClick}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        className={`group relative flex items-center h-10 pr-2 my-[1px] rounded-2xl text-xs cursor-pointer transition-colors ${
          isActive
            ? 'bg-[#375d6b] text-white font-medium'
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
        <span className={`truncate flex-1 ${node.isClosed ? 'text-gray-200' : ''}`}>
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
      </div>
      {hasChildren && isExpanded && (
        <div className="flex flex-col">
          {node.childrenIDs.map((childID) => (
            <TreeNode key={childID} nodeID={childID} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
    )
    
}