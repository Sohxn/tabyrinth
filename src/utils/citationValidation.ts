import { type Source } from "../types";

const REQUIRED: Record<Source["type"], (keyof Source)[]> = {
    article: ["authors", "title", "year", "journal"],
    conference: ["authors", "title", "year", "conference"],
    book: ["authors", "title", "year", "publisher"],
    thesis: ["authors", "title", "year", "institution"],
    report: ["authors", "title", "year", "institution"],
    preprint: ["authors", "title", "year"],
    webpage: ["title"],
};

export function missingFields(source: Source): string[] {
    return (REQUIRED[source.type] || REQUIRED.webpage).filter((key) => {
        const value = source[key];
        return Array.isArray(value) ? value.length === 0 : !value;
    }) as string[];
}

export function isComplete(source: Source): boolean {
    return missingFields(source).length === 0;
}
