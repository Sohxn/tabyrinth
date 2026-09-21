import React, { useState } from 'react';
import { TreeNode } from './TreeNode';
import { type TabGroup } from '@/src/types';

interface GhostGroupProps {
    group: TabGroup;
    isResettingGhosts?: boolean;
}

export function GhostGroup({ group, isResettingGhosts }: GhostGroupProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (group.nodeIDs.length === 0) return null;

    return (
        <div className="flex flex-col mt-3">
            <button
                onClick={() => setIsExpanded((prev) => !prev)}
                className="flex items-center gap-2 px-3 h-8 rounded-full bg-black text-white hover:text-white hover:bg-white/5 transition-colors cursor-pointer w-fit"
            >
                <span className={`text-[9px] transition-transform duration-150 inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                <span className="text-[11px] font-semibold uppercase tracking-wide">Closed tabs</span>
                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full font-mono">{group.nodeIDs.length}</span>
            </button>

            {isExpanded && (
                <div className="flex flex-col gap-1 mt-1">
                    {group.nodeIDs.map((nodeID) => (
                        <TreeNode key={nodeID} nodeID={nodeID} depth={0} isResettingGhosts={isResettingGhosts} />
                    ))}
                </div>
            )}
        </div>
    );
}