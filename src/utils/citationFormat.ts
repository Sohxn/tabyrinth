import { type Source } from "../types";

function parseName(value: string): { last: string; first: string } {
    const trimmed = value.trim();
    if (trimmed.includes(",")) {
        const [last, first = ""] = trimmed.split(",").map((part) => part.trim());
        return { last: last || "", first };
    }
    const parts = trimmed.split(/\s+/);
    const last = parts.pop() || "";
    return { last, first: parts.join(" ") };
}

function initials(first: string): string {
    return first.split(/[\s-]+/).filter(Boolean).map((part) => `${part[0]!.toUpperCase()}.`).join(" ");
}

function escapeBibtex(value: string): string {
    return (value || "").replace(/([&%$#_])/g, "\\$1");
}

export function toBibtex(source: Source): string {
    const authors = source.authors.map(parseName).map((name) => `${name.last}, ${name.first}`).join(" and ");
    const pages = (source.pages || "").replace("–", "--");
    const common = { author: authors, title: source.title ? `{${escapeBibtex(source.title)}}` : "", year: source.year };
    let bibType = "misc";
    let extra: Record<string, string> = {};

    switch (source.type) {
        case "article":
            bibType = "article";
            extra = { journal: escapeBibtex(source.journal), volume: source.volume, number: source.issue, pages, doi: source.doi };
            break;
        case "conference":
            bibType = "inproceedings";
            extra = { booktitle: escapeBibtex(source.conference), address: escapeBibtex(source.address), month: source.month, publisher: escapeBibtex(source.publisher), pages, url: source.url, doi: source.doi };
            break;
        case "thesis":
            bibType = "phdthesis";
            extra = { school: escapeBibtex(source.institution) };
            break;
        case "report":
            bibType = "techreport";
            extra = { institution: escapeBibtex(source.institution) };
            break;
        case "book":
            bibType = "book";
            extra = { publisher: escapeBibtex(source.publisher) };
            break;
        case "preprint":
            extra = { eprint: source.arxiv, archivePrefix: "arXiv", doi: source.doi };
            break;
        default:
            extra = { howpublished: source.url ? `\\url{${source.url}}` : "", note: source.accessed ? `Accessed: ${source.accessed}` : "" };
    }

    const body = Object.entries({ ...common, ...extra })
        .filter(([, value]) => value.length > 0)
        .map(([key, value]) => `  ${key} = {${value}}`)
        .join(",\n");
    return `@${bibType}{${source.citeKey},\n${body}\n}`;
}

export function toApa(source: Source): { html: string; text: string } {
    const names = source.authors.map(parseName).map((name) => `${name.last}, ${initials(name.first)}`);
    const author = names.length > 2 ? names.slice(0, -1).join(", ") + ", & " + names[names.length - 1] : names.join(", & ");
    const lead = author || source.site || source.title;
    const date = `(${source.year || "n.d."})`;
    const link = source.doi ? `https://doi.org/${source.doi}` : source.url;

    if (source.type === "article") {
        const volume = source.volume ? `, <i>${source.volume}</i>${source.issue ? `(${source.issue})` : ""}` : "";
        const pages = source.pages ? `, ${source.pages}` : "";
        return {
            html: `${lead} ${date}. ${source.title}. <i>${source.journal}</i>${volume}${pages}. ${link}`,
            text: `${lead} ${date}. ${source.title}. ${source.journal}${source.volume ? `, ${source.volume}` : ""}${pages}. ${link}`,
        };
    }
    return {
        html: `${lead} ${date}. <i>${source.title}</i>. ${source.site}. ${link}`,
        text: `${lead} ${date}. ${source.title}. ${source.site}. ${link}`,
    };
}

export function toIeee(source: Source): { html: string; text: string } {
    const names = source.authors.map(parseName).map((name) => `${initials(name.first)} ${name.last}`);
    const author = names.length > 6 ? `${names[0]} et al.` : names.length > 2 ? names.slice(0, -1).join(", ") + ", and " + names[names.length - 1] : names.join(" and ");
    const doi = source.doi ? `, doi: ${source.doi}` : "";
    const pages = source.pages ? `, pp. ${source.pages}` : "";
    const year = source.year ? `, ${source.year}` : "";

    if (source.type === "article") {
        const volume = (source.volume ? `, vol. ${source.volume}` : "") + (source.issue ? `, no. ${source.issue}` : "");
        return {
            html: `${author}, “${source.title},” <i>${source.journal}</i>${volume}${pages}${year}${doi}.`,
            text: `${author}, "${source.title}," ${source.journal}${volume}${pages}${year}${doi}.`,
        };
    }
    if (source.type === "conference") {
        const address = source.address ? `, ${source.address}` : "";
        return {
            html: `${author}, “${source.title},” in <i>${source.conference}</i>${address}${year}${pages}${doi}.`,
            text: `${author}, "${source.title}," in ${source.conference}${address}${year}${pages}${doi}.`,
        };
    }
    return {
        html: `${author ? `${author}, ` : ""}“${source.title},” ${source.site}. [Online]. Available: ${source.url} (accessed ${source.accessed}).`,
        text: `${author ? `${author}, ` : ""}"${source.title}," ${source.site}. [Online]. Available: ${source.url} (accessed ${source.accessed}).`,
    };
}

export function formatSources(sources: Source[], style: "apa" | "ieee"): { html: string; text: string } {
    const items = sources.map((source) => style === "apa" ? toApa(source) : toIeee(source));
    if (style === "apa") items.sort((a, b) => a.text.localeCompare(b.text));
    return {
        html: items.map((item, index) => `<p>${style === "ieee" ? `[${index + 1}] ` : ""}${item.html}</p>`).join(""),
        text: items.map((item, index) => `${style === "ieee" ? `[${index + 1}] ` : ""}${item.text}`).join("\n\n"),
    };
}

export function formatBibtex(sources: Source[]): string {
    return sources.map(toBibtex).join("\n\n");
}
