# Cloud Sync Pipeline Expansion

To close the gap between local storage and cloud sync, we need to update both the Extension (Client) and the Cloudflare Worker (Server). Because the Worker uses **Zod** for strict schema validation, any field added to the extension that isn't added to the Worker's schema will cause the `/api/sync` POST request to fail with a `400 Invalid payload schema` error.

## 1. Extension Changes (`src/types/index.ts`)

Update the `SyncPayload` interface to include the missing features.

```ts
export interface SyncPayload {
    updatedAt: number;
    activeWorkspaceID: string;
    workspaces: Workspace[];
    nodes: Record<string | number, TabNode>;
    rootIDs: (string | number)[];
    groups: Record<string, TabGroup>;
    // --- NEW FIELDS ---
    moodboardItems?: Record<string, MoodboardItem>;
    hotTabs?: Record<string, HotTabSet>;
    // ------------------
}
```
---
## 2. Cloudflare Worker Changes (`schemas/sync.ts`)

The Worker must be updated to recognize these new fields in the `SyncPayloadSchema`.

### Step A: Define the MoodboardItem Schema
Add this above the `SyncPayloadSchema`.

```ts
export const MoodboardItemSchema = z.object({
  id: z.string(),
  type: z.enum(["image", "note"]),
  content: z.string(),
  sourceURL: z.string().optional(),
  sourceTitle: z.string().optional(),
  workspaceID: z.string(),
  createdAt: z.number(),
  isEmbedded: z.boolean().optional(),
  aspectRatio: z.number().optional(),
  linkedTo: z.string().optional(),
  linkRole: z.enum(["caption", "annotation"]).optional(),
});
```

### Step B: Define the HotTab Schemas
Add these above the `SyncPayloadSchema`.

```ts
export const HotTabItemSchema = z.object({
  url: z.string(),
  title: z.string(),
  favIconUrl: z.string().optional(),
});

export const HotTabSetSchema = z.object({
  id: z.string(),
  name: z.string(),
  items: z.array(HotTabItemSchema),
  createdAt: z.number(),
});
```

### Step C: Update `SyncPayloadSchema`
Add the new records to the main payload schema.

```ts
export const SyncPayloadSchema = z.object({
  updatedAt: z.number(),
  activeWorkspaceID: z.string(),
  workspaces: z.array(WorkspaceSchema),
  nodes: z.record(z.string(), TabNodeSchema),
  rootIDs: z.array(z.union([z.string(), z.number()])),
  groups: z.record(z.string(), TabGroupSchema).default({}),
  // --- NEW FIELDS ---
  moodboardItems: z.record(z.string(), MoodboardItemSchema).optional(),
  hotTabs: z.record(z.string(), HotTabSetSchema).optional(),
  // ------------------
});
```

---

## 3. Implementation Checklist

1.  **Update Worker First**: Deploy the Cloudflare Worker changes first. If the extension starts sending new data before the Worker is ready, all syncs will fail.
2.  **Update Extension Types**: Update `src/types/index.ts`.
3.  **Update Sync Logic**: In the extension code that prepares the `SyncPayload` for the `POST` request, ensure `moodboardItems` and `hotTabs` are extracted from the store and added to the body.

## Expected Result
After these changes, the entire `TreeStorageSchema` (excluding only transient UI state like `expandedNodeIDs` or `searchQuery`) will be mirrored in the cloud, allowing a seamless transition between devices for both the Tab Tree and the Moodboard/HotTabs features.
