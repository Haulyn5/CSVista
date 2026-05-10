import { useState } from "react";

import { MAX_RECENT_FILES, loadRecentFiles, storeRecentFiles } from "./recentFilesStorage";
import type { RecentFile } from "./types";

export function useRecentFiles() {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => loadRecentFiles());

  function rememberRecentFile(recentPath: string, name: string) {
    setRecentFiles((currentFiles) => {
      const nextFiles = [
        {
          path: recentPath,
          name,
          openedAt: Date.now()
        },
        ...currentFiles.filter((recentFile) => recentFile.path !== recentPath)
      ].slice(0, MAX_RECENT_FILES);
      storeRecentFiles(nextFiles);
      return nextFiles;
    });
  }

  function removeRecentFile(recentPath: string) {
    setRecentFiles((currentFiles) => {
      const nextFiles = currentFiles.filter((recentFile) => recentFile.path !== recentPath);
      storeRecentFiles(nextFiles);
      return nextFiles;
    });
  }

  function clearRecentFiles() {
    setRecentFiles([]);
    storeRecentFiles([]);
  }

  return {
    recentFiles,
    rememberRecentFile,
    removeRecentFile,
    clearRecentFiles
  };
}

