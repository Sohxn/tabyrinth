// Utility to escape HTML special characters
export const escapeHTML = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Heuristic to detect if a block of text looks like source code.
 */
export function isLikelyCode(text: string): boolean {
    if (!text) return false;

    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return false;

    let score = 0;

    // 1. Indentation check: consistent leading whitespace
    const indentationMatches = lines.filter(line => line.length > 0 && /^\s+/.test(line)).length;
    if (indentationMatches > lines.length * 0.3) score += 2;

    // 2. Symbol density: characters common in code but rare in prose
    const codeSymbols = /[{};()\[\]=>]/g;
    const symbolMatches = (text.match(codeSymbols) || []).length;
    if (symbolMatches > text.length * 0.05) score += 2;

    // 3. Keyword detection
    const keywords = /\b(const|let|var|function|async|await|return|if|else|for|while|class|import|export|def|public|private|static)\b/g;
    const keywordMatches = (text.match(keywords) || []).length;
    if (keywordMatches > 0) score += 1;

    // 4. Line breaks vs length: many short lines often suggest code
    const avgLineLength = text.length / lines.length;
    if (avgLineLength < 60 && lines.length > 2) score += 1;

    return score >= 3;
}

/**
 * Smartly converts plain text to HTML, detecting code blocks or using paragraph wrapping.
 */
export function smartTextToHTML(text: string): string {
    if (!text) return '';

    // Support explicit Markdown-style code blocks
    if (text.trim().startsWith('```')) {
        const content = text.replace(/^```\s*.*\n?/, '').replace(/\n?```$/, '');
        return `<pre><code>${escapeHTML(content)}</code></pre>`;
    }

    // Heuristic detection for code
    if (isLikelyCode(text)) {
        return `<pre><code>${escapeHTML(text)}</code></pre>`;
    }

    // Default to paragraph wrapping for prose
    const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return '';

    return lines.map(line => `<p>${escapeHTML(line)}</p>`).join('');
}

// Keep for backward compatibility if needed, but delegate to smart builder
export function plainTextToParagraph(text: string): string {
    return smartTextToHTML(text);
}
