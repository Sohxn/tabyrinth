const allowedTags = new Set([
    'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'CODE', 'PRE', 'UL', 'OL', 'LI', 'SUP', 'A'
])

export function sanitizeHTML(rawString: string): string {

    const domParser = new DOMParser();
    const doc = domParser.parseFromString(rawString, 'text/html');

    const walk = (node: ChildNode): Node[] => {
        if (node.nodeType === Node.TEXT_NODE) {
            return [node.cloneNode()];
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return [];
        }

        const element = node as HTMLElement;
        const tag = element.tagName;

        // skip these categories
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IMG') {
            return [];
        }

        const childResults: Node[] = [];
        element.childNodes.forEach((child) => {
            childResults.push(
                ...walk(child)
            );
        });
        // validation   
        if (!allowedTags.has(tag)) {
            return childResults;
        }

        const clean = doc.createElement(tag.toLowerCase());
        if (tag === 'A') {
            const href = element.getAttribute('href');
            if (href && (href.startsWith('http') || href.startsWith('/'))) {
                clean.setAttribute('href', href);
            }
        }
        childResults.forEach((child) => clean.appendChild(child));
        return [clean];
    }

    const container = doc.createElement('div');
    doc.body.childNodes.forEach((child) => {
        walk(child).forEach((n) => container.appendChild(n));
    });

    return container.innerHTML;
}