import React, { useMemo, useState } from "react";
import { useTreeStore } from "@/src/store/useTreeStore";
import { StorageService } from "@/src/services/storage";
import { formatSources, formatBibtex } from "@/src/utils/citationFormat";
import { missingFields } from "@/src/utils/citationValidation";
import { type Source, type SourceType } from "@/src/types";

interface Props {
  onClose: () => void;
}

type Style = "apa" | "ieee" | "bibtex";

export function CitationExportPanel({ onClose }: Props) {
  const nodes = useTreeStore((state) => state.nodes);
  const activeWorkspaceID = useTreeStore((state) => state.activeWorkspaceID);
  const [style, setStyle] = useState<Style>("apa");
  const [excluded, setExcluded] = useState<Set<string | number>>(new Set());
  const [editing, setEditing] = useState<string | number | null>(null);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);

  const sources = useMemo(() => Object.values(nodes)
    .filter((node) =>
      !node.isRemote &&
      (node.workspaceID || "workspace-default") === activeWorkspaceID &&
      !!node.source
    )
    .map((node) => ({ nodeID: node.id, source: node.source! })), [nodes, activeWorkspaceID]);

  const selected = sources.filter(({ nodeID }) => !excluded.has(nodeID));
  const incomplete = selected.filter(({ source }) => missingFields(source).length > 0);

  const toggle = (nodeID: string | number) => {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(nodeID)) next.delete(nodeID);
      else next.add(nodeID);
      return next;
    });
  };

  const copy = async () => {
    if (!selected.length) {
      setStatus({ text: "No sources selected", isError: true });
      return;
    }
    try {
      if (style === "bibtex") {
        await navigator.clipboard.writeText(formatBibtex(selected.map(({ source }) => source)));
      } else {
        const { html, text } = formatSources(selected.map(({ source }) => source), style);
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        })]);
      }
      setStatus({ text: `Copied ${selected.length} references`, isError: false });
    } catch (error) {
      console.error("[CITATION] Copy failed:", error);
      setStatus({ text: "Clipboard write failed", isError: true });
    }
  };

  const downloadBib = () => {
    const url = URL.createObjectURL(new Blob(
      [formatBibtex(selected.map(({ source }) => source))],
      { type: "text/plain" }
    ));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "references.bib";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const copyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(`\\cite{${key}}`);
      setStatus({ text: `Copied \\cite{${key}}`, isError: false });
    } catch (error) {
      console.error("[CITATION] Cite key copy failed:", error);
      setStatus({ text: "Clipboard write failed", isError: true });
    }
  };

  const saveEdit = async (nodeID: string | number, patch: Partial<Source>, edited: string[]) => {
    const current = nodes[nodeID]?.source;
    if (!current) return;
    await StorageService.updateNodeSource(nodeID, {
      ...current,
      ...patch,
      userEdited: Array.from(new Set([...current.userEdited, ...edited])),
    });
    setEditing(null);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Export Citations</h2>
        <button onClick={onClose} className="px-2 text-base font-bold text-gray-400 hover:text-white">✕</button>
      </div>
      {!sources.length ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <p className="text-sm text-gray-400">No sources captured in this workspace yet.</p>
          <p className="mt-2 max-w-xs text-xs text-gray-500">
            Right-click a page and choose “Capture citation metadata” to add it.
          </p>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2">
            {sources.map(({ nodeID, source }) => {
              const missing = missingFields(source);
              return (
                <div key={String(nodeID)} className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-white/10 p-3">
                  <div className="flex items-start gap-2">
                    <input type="checkbox" checked={!excluded.has(nodeID)} onChange={() => toggle(nodeID)} className="mt-1 accent-[#FF6314]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-gray-200">{source.title || "(untitled)"}</span>
                        {missing.length > 0 && <span title={`Missing: ${missing.join(", ")}`} className="shrink-0 text-[10px] text-yellow-400">⚠</span>}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] text-gray-400">
                        <span>{source.type}</span><span>·</span>
                        <button onClick={() => void copyKey(source.citeKey)} className="hover:text-orange-400" title="Copy cite key">{source.citeKey}</button>
                      </div>
                    </div>
                    <button onClick={() => setEditing(nodeID)} className="shrink-0 px-1 text-[10px] text-gray-400 hover:text-orange-400">edit</button>
                  </div>
                  {editing === nodeID && (
                    <EditForm source={source} onCancel={() => setEditing(null)} onSave={(patch, fields) => void saveEdit(nodeID, patch, fields)} />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-gray-400">Format</span>
            {(["apa", "ieee", "bibtex"] as Style[]).map((value) => (
              <button key={value} onClick={() => setStyle(value)} className={`rounded-xl px-3 py-1.5 text-xs font-bold ${style === value ? "bg-[#FF6314] text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"}`}>
                {value.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="mb-2 flex gap-2">
            <button onClick={() => void copy()} className="flex-1 rounded-xl bg-[#FF6314] py-2 text-xs font-bold text-white hover:bg-[#ff742d]">Copy</button>
            {style === "bibtex" && <button onClick={downloadBib} className="flex-1 rounded-xl bg-white/10 py-2 text-xs font-bold text-white hover:bg-white/20">Download .bib</button>}
          </div>
          {incomplete.length > 0 && <div className="mb-2 text-[11px] text-yellow-400">{incomplete.length} source{incomplete.length === 1 ? "" : "s"} missing details</div>}
          {status && <div className={`rounded-xl p-2.5 text-xs font-bold ${status.isError ? "bg-red-600" : "bg-green-600"} text-white`}>{status.text.toUpperCase()}</div>}
        </>
      )}
    </div>
  );
}

interface EditFormProps {
  source: Source;
  onCancel: () => void;
  onSave: (patch: Partial<Source>, edited: string[]) => void;
}

const SOURCE_TYPES: SourceType[] = ["article", "conference", "thesis", "report", "book", "preprint", "webpage"];
const EDITABLE_FIELDS: (keyof Source)[] = ["title", "year", "month", "journal", "conference", "address", "publisher", "institution", "volume", "issue", "pages", "doi", "arxiv", "site", "url", "accessed"];

function EditForm({ source, onCancel, onSave }: EditFormProps) {
  const [draft, setDraft] = useState<Source>({ ...source });
  const [edited, setEdited] = useState<Set<string>>(new Set());
  const setField = (key: keyof Source, value: string) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setEdited((previous) => new Set(previous).add(String(key)));
  };
  return (
    <div className="mt-2 flex flex-col gap-2">
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase text-gray-400">Type</span>
        <select value={draft.type} onChange={(event) => setField("type", event.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white">
          {SOURCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      {EDITABLE_FIELDS.map((field) => (
        <label key={String(field)} className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase text-gray-400">{String(field)}</span>
          <input value={String(draft[field] || "")} onChange={(event) => setField(field, event.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white" />
        </label>
      ))}
      <label className="flex flex-col gap-0.5">
        <span className="text-[10px] uppercase text-gray-400">Authors (semicolon-separated)</span>
        <input value={draft.authors.join("; ")} onChange={(event) => {
          setDraft((previous) => ({ ...previous, authors: event.target.value.split(";").map((value) => value.trim()).filter(Boolean) }));
          setEdited((previous) => new Set(previous).add("authors"));
        }} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white" />
      </label>
      <div className="mt-1 flex gap-2">
        <button onClick={() => onSave(draft, Array.from(edited))} className="flex-1 rounded-lg bg-[#FF6314] py-1.5 text-xs font-bold text-white hover:bg-[#ff742d]">Save</button>
        <button onClick={onCancel} className="flex-1 rounded-lg bg-white/10 py-1.5 text-xs font-bold text-white hover:bg-white/20">Cancel</button>
      </div>
    </div>
  );
}
