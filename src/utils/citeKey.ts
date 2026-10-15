import { type Source } from "../types";

type CapturedSource = Omit<Source, "citeKey" | "userEdited">;

function asciiFold(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z]/g, "").toLowerCase();
}

function firstAuthorLastName(authors: string[]): string {
    const first = authors[0]?.trim();
    if (!first) return "";
    if (first.includes(",")) return first.split(",")[0]!.trim();
    const parts = first.split(/\s+/);
    return parts[parts.length - 1] || "";
}

function firstMeaningfulTitleWord(title: string): string {
    const words = title.split(/\s+/).filter((word) => word.length > 2);
    return words[0] || title.split(/\s+/)[0] || "anon";
}

export function baseCiteKey(source: CapturedSource): string {
    const stem = firstAuthorLastName(source.authors) || firstMeaningfulTitleWord(source.title);
    return `${asciiFold(stem)}${source.year || "nd"}`;
}

export function generateCiteKey(source: CapturedSource, existingKeys: Set<string>): string {
    const base = baseCiteKey(source);
    if (!existingKeys.has(base)) return base;
    for (let index = 0; index < 26; index++) {
        const candidate = `${base}${String.fromCharCode(97 + index)}`;
        if (!existingKeys.has(candidate)) return candidate;
    }
    return `${base}${Date.now().toString(36)}`;
}
