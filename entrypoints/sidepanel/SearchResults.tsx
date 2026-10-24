import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTreeStore } from "@/src/store/useTreeStore";
import { REMOTE_WORKSPACE_ID } from "@/src/types";
import { activateNode } from "@/src/utils/activateNode";
import { getBreadcrumb, searchNodes, type SearchMode, type SearchResult } from "@/src/utils/searchNodes";

const MODES: { value: SearchMode; label: string }[] = [
    { value: "all", label: "All" },
    { value: "tabs", label: "Tabs" },
    { value: "notes", label: "Notes" },
];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const getDomain = (url: string) => {
    try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};
const chipClass = (active: boolean) => `rounded-xl px-3 py-1.5 text-xs font-bold 
transition-colors ${active ? "bg-[#FF6314] text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"}`;

function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
    if (tokens.length === 0) return <>{text}</>;
    const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
    return <>{text.split(pattern).map((part, index) =>
        index % 2 === 1 ? <mark key={index} className="rounded-sm bg-[#FF6314]/40 text-white">{part}</mark> : part
    )}</>;
}

interface Props { onClose: () => void; }

export function SearchResults({ onClose }: Props) {
    const nodes = useTreeStore((state) => state.nodes);
    const query = useTreeStore((state) => state.searchQuery);
    const mode = useTreeStore((state) => state.searchMode);
    const scope = useTreeStore((state) => state.searchScope);
    const includeClosed = useTreeStore((state) => state.searchIncludeClosed);
    const activeWorkspaceID = useTreeStore((state) => state.activeWorkspaceID);
    const setMode = useTreeStore((state) => state.setSearchMode);
    const setScope = useTreeStore((state) => state.setSearchScope);
    const setIncludeClosed = useTreeStore((state) => state.setSearchIncludeClosed);
    const setActiveWorkspace = useTreeStore((state) => state.setActiveWorkspace);
    const [activeIndex, setActiveIndex] = useState(0);
    const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
    const tokens = useMemo(() => query.toLowerCase().split(/\s+/).filter(Boolean), [query]);
    const results = useMemo(() => searchNodes(nodes, query, {
        mode, scope, workspaceID: activeWorkspaceID, includeClosed
    }), [nodes, query, mode, scope, activeWorkspaceID, includeClosed]);

    useEffect(() => { setActiveIndex(0); }, [query, mode, scope, includeClosed]);
    useEffect(() => { rowRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" }); }, [activeIndex]);

    const openResult = async (result: SearchResult) => {
        const node = nodes[result.nodeID];
        if (!node || !(await activateNode(node))) return;
        const workspaceID = node.workspaceID || "workspace-default";
        const inCloudView = node.isRemote && activeWorkspaceID === REMOTE_WORKSPACE_ID;
        if (workspaceID !== activeWorkspaceID && !inCloudView) await setActiveWorkspace(workspaceID);
        onClose();
    };

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.isComposing) return;
            if (event.key === "Escape") { event.preventDefault(); onClose(); }
            else if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
            } else if (event.key === "ArrowUp") {
                event.preventDefault(); setActiveIndex((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter") {
                const target = results[activeIndex];
                if (target) { event.preventDefault(); void openResult(target); }
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    });

    return (
        <div className="search-overlay-enter absolute inset-0 z-30 flex flex-col bg-black/60 py-4 px-2 pb-20 backdrop-blur-md">
            <div onMouseDown={(event) => event.preventDefault()} className="mb-2 flex flex-wrap items-center gap-2 px-1">
                {MODES.map(({ value, label }) => (
                    <button key={value} onClick={() => setMode(value)} className={chipClass(mode === value)}>{label}</button>
                ))}
                <span className="mx-1 h-4 w-px bg-white/20" />
                <button onClick={() => setScope(scope === "workspace" ? "all" : "workspace")} className={chipClass(scope === "all")}>
                    {scope === "workspace" ? "This workspace" : "All workspaces"}
                </button>
                <button onClick={() => setIncludeClosed(!includeClosed)} className={chipClass(includeClosed)}>Closed</button>
            </div>
            <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
                {tokens.length === 0 ? <p className="p-4 text-center text-sm font-bold text-gray-400">Type to search</p> :
                    results.length === 0 ? <p className="p-4 text-center text-sm font-bold text-gray-400">No matches</p> :
                        results.map((result, index) => {
                            const node = nodes[result.nodeID];
                            if (!node) return null;
                            const breadcrumb = getBreadcrumb(node.id, nodes);
                            return <div key={String(result.nodeID)} ref={(element) => { rowRefs.current[index] = element; }}
                                onClick={() => void openResult(result)}
                                className={`flex cursor-pointer flex-col gap-0.5 rounded-2xl border-2 px-3 py-2 transition-colors ${index === activeIndex ? "border-[#FF6314]/70 bg-[#3c516f]/70" : "border-[#333333] bg-black/50 hover:bg-white/10"} ${node.isClosed ? "opacity-50" : ""}`}>
                                <div className="flex items-center gap-2">
                                    {node.favIconURL ? <img src={node.favIconURL} alt="" className="h-4 w-4 shrink-0 rounded-sm" /> : <div className="h-4 w-4 shrink-0 rounded-sm bg-gray-600" />}
                                    <span className="flex-1 truncate text-[14px] text-white"><Highlight text={node.title || "New Tab"} tokens={tokens} /></span>
                                    {node.isClosed && <span className="shrink-0 rounded-full bg-white/10 px-1.5 font-mono text-[9px] text-gray-400">closed</span>}
                                    {node.isRemote && <span className="shrink-0 rounded-full bg-cyan-900 px-1.5 font-mono text-[9px] text-white/90">cloud</span>}
                                </div>
                                <div className="truncate text-[11px] text-gray-400"><Highlight text={result.snippet ?? getDomain(node.url)} tokens={tokens} /></div>
                                {breadcrumb.length > 0 && <div className="truncate text-[10px] text-gray-500">{breadcrumb.join(" › ")}</div>}
                            </div>;
                        })}
            </div>
        </div>
    );
}
