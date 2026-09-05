import React, {useState, useEffect} from "react";
import { StorageService } from "@/src/services/storage";
import { type TreeStorageSchema } from "@/src/types";

export default function App() {
    const [data, setData] = useState<TreeStorageSchema | null>(null);

    useEffect(() => {
        StorageService.get().then(setData);

        const handleStorageChange = (
            changes: 
                {
                    [key: string]: chrome.storage.StorageChange
                } 
        ) => {
            if(changes.tabTreeData) {
                setData(changes.tabTreeData.newValue as TreeStorageSchema);
            }
        };

        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);


    return(
        <div className="flex flex-col h-screen w-full bg-[#1f1924] text-[#e3e1e5] p-3 text-xs">
      <div className="flex items-center justify-between pb-3 border-b border-[#362e3d]">
        <span className="font-semibold text-sm tracking-wide">Tab Tree Shell</span>
        <span className="text-[10px] text-gray-400 bg-[#2b2432] px-2 py-0.5 rounded-full">
          {data ? Object.keys(data.nodes).length : 0} Active
        </span>
      </div>
      <div className="flex-1 overflow-y-auto mt-3 space-y-2">
        {!data || Object.keys(data.nodes).length === 0 ? (
          <p className="text-gray-500 italic text-center mt-10">Open tabs to verify state capture...</p>
        ) : (
          Object.values(data.nodes).map((node) => (
            <div
              key={node.id}
              className="p-2 rounded-lg bg-[#2b2432] border border-[#3b3244] flex items-center justify-between"
            >
              <div className="flex items-center space-x-2 truncate">
                {node.favIconURL && <img src={node.favIconURL} alt="" className="w-4 h-4 rounded-sm" />}
                <span className={`truncate ${node.isClosed ? 'line-through text-gray-500' : ''}`}>
                  {node.title}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
    );
}