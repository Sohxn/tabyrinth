import React, { useState } from 'react';
import { useTreeStore } from '@/src/store/useTreeStore';
import { TreeNode } from './TreeNode';

interface CloudGroupProps {
    workspaceID: string;
    isResettingGhosts?: boolean;
}

export function CloudGroup({ workspaceID, isResettingGhosts }: CloudGroupProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const cloudNodes = useTreeStore((state) => state.getCloudNodes(workspaceID));
    const launchAllCloud = useTreeStore((state) => state.launchAllCloud);

    if (cloudNodes.length === 0) return null;

    return (
        <div className="flex flex-col mt-3">
            <div className="flex items-center gap-1 w-fit">
                <button
                    onClick={() => setIsExpanded((prev) => !prev)}
                    className="flex items-center gap-2 px-3 h-8 rounded-full bg-[#2a3a52] text-white/90 hover:text-white hover:bg-[#334a68] transition-colors cursor-pointer"
                >
                    <span className={`text-[9px] transition-transform duration-150 inline-block ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                    <span className="text-[12px] font-bold uppercase tracking-wide">Cloud</span>
                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full font-mono">{cloudNodes.length}</span>
                </button>

                <button
                    onClick={() => void launchAllCloud(workspaceID)}
                    title="Launch all cloud tabs"
                    className="h-8 px-2 rounded-full bg-[#FF6314] hover:bg-[#ff742d] text-white text-[11px] font-bold transition-colors"
                >
                    Launch all
                </button>
            </div>

            {isExpanded && (
                <div className="flex flex-col gap-1 mt-1">
                    {cloudNodes.map((nodeID) => (
                        <TreeNode
                            key={nodeID}
                            nodeID={nodeID}
                            depth={0}
                            isResettingGhosts={isResettingGhosts}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
