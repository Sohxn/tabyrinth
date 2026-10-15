import { type Source, type SourceType } from "../types";

/**
 * Injected into a page; keep this function self-contained for Chrome serialization.
 */
export function captureSourceInPage(): Omit<Source, "citeKey" | "userEdited"> {
    const meta = (name: string): string[] =>
        Array.from(document.querySelectorAll(`meta[name="${name}"], meta[property="${name}"]`))
            .map((el) => (el as HTMLMetaElement).content?.trim() || "")
            .filter(Boolean);

    const detectType = (): SourceType => {
        if (meta("citation_conference_title").length) return "conference";
        if (meta("citation_dissertation_institution").length) return "thesis";
        if (meta("citation_technical_report_institution").length) return "report";
        if (meta("citation_arxiv_id").length) return "preprint";
        if (meta("citation_isbn").length || meta("citation_book_title").length) return "book";
        if (meta("citation_journal_title").length) return "article";
        return "webpage";
    };

    const stripTracking = (raw: string): string => {
        try {
            const url = new URL(raw);
            const drop = /^(utm_|fbclid$|gclid$|mc_|ref$)/;
            for (const key of Array.from(url.searchParams.keys())) {
                if (drop.test(key)) url.searchParams.delete(key);
            }
            return url.toString();
        } catch {
            return raw;
        }
    };

    const dateRaw = meta("citation_publication_date")[0] ||
        meta("citation_date")[0] ||
        meta("article:published_time")[0] || "";
    const monthMatch = dateRaw.match(/-(\d{2})-/);
    const firstPage = meta("citation_firstpage")[0] || "";
    const lastPage = meta("citation_lastpage")[0] || "";

    return {
        type: detectType(),
        title: meta("citation_title")[0] || meta("og:title")[0] || document.title,
        authors: meta("citation_author").length ? meta("citation_author") : meta("author"),
        year: dateRaw.slice(0, 4),
        month: monthMatch?.[1] || "",
        journal: meta("citation_journal_title")[0] || "",
        conference: meta("citation_conference_title")[0] || "",
        address: "",
        publisher: meta("citation_publisher")[0] || "",
        institution: meta("citation_dissertation_institution")[0] ||
            meta("citation_technical_report_institution")[0] || "",
        volume: meta("citation_volume")[0] || "",
        issue: meta("citation_issue")[0] || "",
        pages: [firstPage, lastPage].filter(Boolean).join("–"),
        doi: meta("citation_doi")[0] || "",
        arxiv: meta("citation_arxiv_id")[0] || "",
        site: meta("og:site_name")[0] || location.hostname,
        url: stripTracking((document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href || location.href || ""),
        accessed: new Date().toISOString().slice(0, 10),
    };
}
