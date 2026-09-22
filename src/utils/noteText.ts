// plain text -> html paragraph
export function plainTextToParagraph(text: string): string {
    const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)

    if (lines.length === 0) return '';

    return lines.map((line) => `<p>${escape(line)}</p>`).join('');
}


