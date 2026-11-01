# Security Hardening Plan

This plan contains defense-in-depth improvements identified during the security review. No confirmed exploitable vulnerabilities were found.

## 1. Restrict checkout navigation

Before opening the payment URL returned by the backend:

- Require the URL to use `https:`.
- Allow only trusted payment-provider hostnames.
- Show an error instead of opening unexpected schemes or hosts.

Relevant code: `entrypoints/sidepanel/App.tsx`.

## 2. Escape citation metadata

Citation metadata comes from arbitrary webpages. Before building HTML clipboard output:

- Escape titles, authors, journal names, URLs, and other metadata.
- Keep plain-text output available as a safe fallback.
- Add tests with HTML and script-like metadata values.

Relevant code:

- `src/utils/citationFormat.ts`
- `entrypoints/sidepanel/CitationExportPanel.tsx`

## 3. Validate synced data

Treat cloud sync data as untrusted input:

- Validate node IDs and required fields.
- Validate workspace IDs and collection shapes.
- Accept only approved URL schemes, preferably `https:` and optionally `http:`.
- Reject malformed nodes before writing them to local storage.
- Apply the same validation before reopening a synced or restored tab.

Relevant code:

- `src/services/sync.ts`
- `src/services/storage.ts`

## 4. Minimize extension permissions

Review every permission in `wxt.config.ts` and remove permissions that are not required by documented features. Pay particular attention to:

- `tabs`
- `scripting`
- `activeTab`
- `clipboardWrite`

After changes, test context-menu capture, side-panel behavior, exports, media tracking, and sync.

## 5. Fix development configuration

Correct the malformed development endpoint:

```ts
dev: 'http:localhost:8787'
```

to:

```ts
dev: 'http://localhost:8787'
```

This does not affect the current production endpoint, but it prevents local development connection failures.

## 6. Add regression tests

Add targeted tests for:

- Untrusted checkout URLs.
- Citation metadata containing HTML or script-like text.
- Synced nodes with unsafe schemes such as `javascript:` or `data:`.
- Malformed remote payloads.
- Permission-dependent features after manifest changes.

## Suggested order

1. Checkout URL validation.
2. Citation metadata escaping.
3. Synced data and URL validation.
4. Permission review.
5. Development URL correction.
6. Regression coverage.
