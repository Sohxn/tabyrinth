# Hot Tab Favicon Fix

This plan implements a "Data Capture" approach to favicons, saving the icon URL at snapshot time instead of reconstructing it on every render.

## 1. `src/types/index.ts`
Update the `HotTabItem` interface to include the optional favicon URL.

```ts
export interface HotTabItem {
    url: string;
    title: string;
    favIconUrl?: string; // Add this line
}
```

---

## 2. `entrypoints/sidepanel/App.tsx` (Capture Logic)
Modify the `handleCreateHotTabSet` function to capture the `favIconUrl` from the `chrome.tabs.Tab` object.

```ts
// Inside handleCreateHotTabSet
const items = currentTabs
    .filter((tab): tab is chrome.tabs.Tab & { url: string } =>
        typeof tab.url === 'string' &&
        !/^(chrome|edge|about|chrome-extension|moz-extension):/i.test(tab.url)
    )
    .map((tab) => ({
        url: tab.url,
        title: tab.title || tab.url,  
        favIconUrl: tab.favIconUrl || undefined, // ADD THIS LINE
    }));
```

---

## 3. `entrypoints/sidepanel/App.tsx` (Rendering Logic)
Implement a hybrid rendering approach: use the saved URL first, then fallback to the Chrome Favicon API, and finally a background color.

```tsx
<div className='flex items-center justify-center mb-2 gap-1 overflow-hidden'>
  {hotTabSet.items.slice(0, 8).map((item, idx) => {
    // 1. Use saved URL if it exists, otherwise fallback to the API
    const iconSrc = item.favIconUrl || `chrome://favicon2/favicons/pageUrl=${encodeURIComponent(item.url)}&size=32`;
    
    return (
      <img
        key={idx}
        src={iconSrc}
        alt=""
        className='w-5 h-5 rounded-sm object-contain bg-gray-700' // bg-gray-700 covers the "no icon" case
        onError={(e) => { 
          // If both the saved URL AND the API fail, hide the image to avoid broken icons
          e.currentTarget.style.visibility = 'hidden'; 
        }}
      />
    );
  })}
  {hotTabSet.items.length > 8 && (
    <span className="text-[10px] text-gray-500 font-mono ml-1">+{hotTabSet.items.length - 8}</span>
  )}
</div>
```

## Summary of Benefits
- **Performance**: Loads direct URLs instead of querying the browser database.
- **Permissions**: Reduces reliance on specialized favicon permissions.
- **Consistency**: Matches the behavior of the live Tree view.
- **Reliability**: Hybrid fallback handles tabs that were still loading during snapshot creation.
- **Clean UI**: Prevents layout breakage for large Hot Tab sets using a slice and counter.
