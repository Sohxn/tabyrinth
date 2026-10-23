import React, { useState } from "react";
import { useTreeStore } from "@/src/store/useTreeStore";
import { REMOTE_WORKSPACE_ID, type Workspace } from "@/src/types";
import { WScolors } from "@/src/colors/colors";
import { PlusIcon, PencilSimpleIcon } from "@phosphor-icons/react";


export function WorkspaceNotch() {
    const workspaces = useTreeStore((state) => state.workspaces);
    const activeWorkspaceID = useTreeStore((state) => state.activeWorkspaceID);
    // methods
    const createWorkspace = useTreeStore((state) => state.createWorkspace);
    const renameWorkspace = useTreeStore((state) => state.renameWorkspace);
    const assignTab2workspace = useTreeStore((state) => state.assignTabToWorkspace);
    const getTabsByWorkspace = useTreeStore((state) => state.getTabsByWorkspace);
    const setActiveWorkspace = useTreeStore((state) => state.setActiveWorkspace);
    const hasRemote = useTreeStore((state) => Object.values(state.nodes).some((node) => node.isRemote));
    const getAllRemoteNodes = useTreeStore((state) => state.getAllRemoteNodes);

    const [isExpanded, setIsExpanded] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [workspaceName, setWorkspaceName] = useState('');
    // regarding renaming of workspaces
    const [editingID, setEditingID] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    const isRemoteView = activeWorkspaceID === REMOTE_WORKSPACE_ID;
    const activeWorkspace = isRemoteView
        ? { id: REMOTE_WORKSPACE_ID, name: 'Cloud' } as Workspace
        : workspaces.find((w) => w.id === activeWorkspaceID) || workspaces[0];
    const activeWSIndex = activeWorkspace ? workspaces.indexOf(activeWorkspace) : 0;

    const handleSelectWorkspace = (id: string) => {
        useTreeStore.setState({
            activeWorkspaceID: id
        });
        setActiveWorkspace(id);
        setIsExpanded(false);
    };

    // edit workspace
    const startEditingWS = (e: React.MouseEvent, ws: Workspace) => {
        e.stopPropagation();
        setEditingID(ws.id);
        setEditValue(ws.name);
    };

    const commitEditWS = () => {
        if (editingID && editValue.trim()) {
            renameWorkspace(editingID, editValue.trim());
        }
        setEditingID(null);
        setEditValue('');
    };

    const cancelEditWS = () => {
        setEditingID(null);
        setEditValue('');
    }

    const handleNotchDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        if (!isExpanded) setIsExpanded(true);
    };

    const handleDropOnWorkspace = (e: React.DragEvent, workspaceID: string) => {
        e.preventDefault();
        e.stopPropagation();

        const nodeID = e.dataTransfer.getData('text/plain');
        if (nodeID) {
            assignTab2workspace(nodeID, workspaceID);
        }
        setIsExpanded(false);
    };

    const handleCreateGroup = (e: React.FormEvent) => {
        e.preventDefault();
        if (!workspaceName.trim()) return;
        const newID = createWorkspace(workspaceName.trim());
        useTreeStore.setState({
            activeWorkspaceID: newID,
        });
        setActiveWorkspace(newID);
        setWorkspaceName('');
        setShowCreateForm(false);
        setIsExpanded(false);
    }

    const getWorkspaceColor = (workspace?: Workspace, idx: number = 0) => {
        if (!workspace) return '#FF6314';
        if (workspace.id === REMOTE_WORKSPACE_ID) return '#5b9bd5';
        if (workspace.color) return workspace.color;
        if (workspace.isDefault) return '#FF6314';
        return WScolors[idx % WScolors.length];
    }

    return (
        <>
            {/* Collapsed Header Notch */}
            <div
                onClick={() => setIsExpanded(true)}
                onDragOver={handleNotchDragOver}
                className="flex items-center justify-between rounded-3xl h-10 w-full 
                    max-w-xs bg-black/80 border border-white/10 px-3 
                    cursor-pointer hover:border-orange-500/50 transition-all duration-200 group relative z-20">
                <div className="flex items-center gap-2 overflow-hidden">
                    <svg className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:scale-110"
                        fill="currentColor"
                        style={{ color: getWorkspaceColor(activeWorkspace, activeWSIndex) }}
                        viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>


                    <span className="truncate text-xs font-semibold text-gray-200 capitalize">
                        {activeWorkspace?.name || 'untitled'}
                    </span>

                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] bg-white/10 px-2.5 py-1 rounded-xl text-gray-400 font-mono">
                        {isRemoteView
                            ? getAllRemoteNodes().length
                            : getTabsByWorkspace(activeWorkspace?.id ?? '').length}
                    </span>
                    <span className="text-[10px] text-gray-500 group-hover:text-orange-400 transition-colors">
                        ▾
                    </span>
                </div>
            </div>

            {/* Expanded Overlay Modal */}
            {isExpanded && (
                <div
                    onClick={() => setIsExpanded(false)}
                    className="fixed inset-0 z-50 flex items-start justify-center 
                        pt-14 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-80 bg-[#181a1f] border border-white/15 rounded-3xl p-4 shadow-2xl flex flex-col gap-3 animate-in zoom-in-95 duration-200">
                        {/* Overlay Header */}
                        <div className="flex items-center justify-between pb-2.5 px-1">

                            <span className="text-sm font-bold text-gray-200 uppercase tracking-wider">
                                Workspaces
                            </span>

                            {/* fix this */}
                            <button
                                onClick={() => setShowCreateForm(!showCreateForm)}
                                className="flex items-center gap-1 text-[12px] font-semibold text-white 
                                        bg-orange-500 px-2 py-1.5 rounded-2xl
                                        hover:text-black hover:bg-white transition-colors">
                                {!showCreateForm ? <PlusIcon size={16} weight="bold" /> : '⛌'}
                                {!showCreateForm && 'New'}
                            </button>
                        </div>

                        {/* Create Workspace Input */}
                        {showCreateForm && (
                            <form onSubmit={handleCreateGroup} className="flex gap-2">
                                <input
                                    type="text"
                                    value={workspaceName}
                                    onChange={(e) => setWorkspaceName(e.target.value)}
                                    placeholder="Group name"
                                    autoFocus
                                    className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-orange-500"
                                />
                                <button
                                    type="submit"
                                    className="px-3 py-2 my-0.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-semibold">
                                    Add
                                </button>
                            </form>
                        )}

                        {/* drop zone */}
                        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto no-scrollbar">
                            {hasRemote && (
                                <div
                                    onClick={() => handleSelectWorkspace(REMOTE_WORKSPACE_ID)}
                                    className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group
                                        ${activeWorkspaceID === REMOTE_WORKSPACE_ID
                                            ? 'bg-white/10 border-blue-400/60 shadow-md'
                                            : 'bg-black/30 border-white/5 hover:border-white/20 hover:bg-white/5'}`}>
                                    <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                                        <svg
                                            className="w-4 h-4 shrink-0"
                                            fill="currentColor"
                                            style={{ color: '#5b9bd5' }}
                                            viewBox="0 0 20 20">
                                            <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
                                        </svg>
                                        <span className="text-xs font-semibold text-gray-200 truncate">
                                            Cloud
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-gray-400 font-mono">
                                            {getAllRemoteNodes().length}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {workspaces.map((ws, idx) => {
                                const isActive = ws.id === activeWorkspaceID;
                                const wsTabs = getTabsByWorkspace(ws.id);
                                const color = getWorkspaceColor(ws, idx);

                                return (
                                    <div
                                        key={ws.id}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => handleDropOnWorkspace(e, ws.id)}
                                        onClick={() => handleSelectWorkspace(ws.id)}
                                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer group 
                                                ${isActive ? 'bg-white/10 border-orange-500/60 shadow-md' : 'bg-black/30 border-white/5 hover:border-white/20 hover:bg-white/5'}`}>
                                        <div className="flex items-center gap-3 truncate flex-1 min-w-0">
                                            <svg
                                                className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110"
                                                fill="currentColor"
                                                style={{ color }}
                                                viewBox="0 0 20 20">
                                                <path d="M2 6a2 2 0 012-2h4l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                                            </svg>

                                            {editingID === ws.id ? (
                                                <input
                                                    type="text"
                                                    value={editValue}
                                                    onChange={(e) => setEditValue(e.target.value)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') { e.stopPropagation(); commitEditWS(); }
                                                        if (e.key === 'Escape') { e.stopPropagation(); cancelEditWS(); }
                                                    }}
                                                    onBlur={commitEditWS}
                                                    autoFocus
                                                    className="flex-1 min-w-0 bg-black/50 border border-orange-500/60 rounded-lg px-2 py-1 text-xs text-white focus:outline-none"
                                                />
                                            ) : (
                                                <span className="text-xs font-semibold text-gray-200 capitalize truncate">
                                                    {ws.name}
                                                </span>
                                            )}

                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {editingID !== ws.id && (
                                                <button
                                                    onClick={(e) => startEditingWS(e, ws)}
                                                    className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-orange-400 transition-all p-0.5"
                                                    title="Rename group">
                                                    <PencilSimpleIcon size={14} />
                                                </button>
                                            )}
                                            <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full text-gray-400 font-mono">
                                                {wsTabs.length}
                                            </span>
                                            {editingID !== ws.id && (
                                                <span className="text-[10px] text-gray-500 group-hover:text-gray-300 transition-colors">
                                                    Drop →
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}