# Security Review

## Executive summary

The project was reviewed against `plans/security_review.md`, including extension permissions, payment and license handling, cloud sync, storage, context-menu scripting, HTML sanitization, external requests, secrets, and dependencies.

**Result: no confirmed exploitable security vulnerabilities were found in the reviewed code.**

The items below are hardening recommendations. They are useful improvements, but the review did not establish that they are currently exploitable.

## Findings

| # | Severity | Status | Area | Summary |
|---|---|---|---|---|
| 1 | LOW | Recommendation | Checkout navigation | Validate the checkout URL before opening it. |
| 2 | LOW | Recommendation | Citation export | Escape or sanitize webpage metadata before putting it into HTML clipboard output. |
| 3 | LOW | Recommendation | Cloud sync | Validate synced node data and URL schemes before storing or reopening nodes. |
| 4 | LOW | Recommendation | Extension permissions | Recheck that broad permissions are required and documented. |
| 5 | LOW | Maintenance | Development config | Fix the malformed local development URL. |

## Proposed actions

### 1. Restrict checkout URLs

Before calling `chrome.tabs.create`, require:

- `https:`
- An explicit allowlist of trusted payment hosts

Relevant code: `entrypoints/sidepanel/App.tsx:387-388`.

### 2. Protect citation clipboard HTML

Citation metadata comes from arbitrary webpages. Escape metadata values before inserting them into HTML strings used for clipboard output.

Relevant code:

- `src/utils/citationFormat.ts:80-120`
- `entrypoints/sidepanel/CitationExportPanel.tsx:52-57`

The plain-text output should remain available as the fallback.

### 3. Validate synced nodes

Validate remote node shape, IDs, titles, URLs, and workspace fields before persisting them. Only allow safe web URL schemes such as `https:` and, where needed, `http:`.

Relevant areas:

- `src/services/sync.ts`
- `src/services/storage.ts`

Apply the same URL validation before reopening a synced or restored node.

### 4. Review permissions

Review whether every permission in `wxt.config.ts:8-22` is necessary, especially:

- `tabs`
- `scripting`
- `activeTab`
- `clipboardWrite`

Keep permissions that are required by documented features, but remove anything unused.

### 5. Fix the development URL

Change:

```ts
dev: 'http:localhost:8787'
```

to:

```ts
dev: 'http://localhost:8787'
```

This does not affect the current production HTTPS endpoint, but it can break local development.

## Dependency check

The production dependency audit reported no high-severity vulnerabilities:

```text
npm audit --omit=dev --audit-level=high
```

## Conclusion

There is no urgent security fix required based on this review. The recommended actions are defense-in-depth improvements. The highest-value next steps are checkout-host validation, citation HTML escaping, and validation of remotely synced URLs and data.
