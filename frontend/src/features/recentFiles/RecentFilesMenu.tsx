import { useEffect, useRef, useState } from "react";
import { ChevronDown, Clock } from "lucide-react";

import { formatRecentTime } from "../../lib/format";
import type { RecentFile } from "./types";

export function RecentFilesMenu({
  recentFiles,
  onOpenRecent,
  onClearRecentFiles
}: {
  recentFiles: RecentFile[];
  onOpenRecent: (recentFile: RecentFile) => void;
  onClearRecentFiles: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleDocumentPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleDocumentKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [open]);

  return (
    <div className="recent-menu" ref={menuRef}>
      <button
        type="button"
        className="secondary-button recent-button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <Clock size={18} />
        Recent
        <ChevronDown size={16} />
      </button>
      {open ? (
        <div className="recent-popover" role="menu">
          {recentFiles.length > 0 ? (
            <>
              {recentFiles.map((recentFile) => (
                <button
                  type="button"
                  className="recent-item"
                  key={recentFile.path}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onOpenRecent(recentFile);
                  }}
                >
                  <span className="recent-name">{recentFile.name}</span>
                  <span className="recent-path">{recentFile.path}</span>
                  <span className="recent-time">{formatRecentTime(recentFile.openedAt)}</span>
                </button>
              ))}
              <div className="recent-actions">
                <button
                  type="button"
                  className="recent-clear"
                  role="menuitem"
                  onClick={() => {
                    onClearRecentFiles();
                    setOpen(false);
                  }}
                >
                  Clear recent files
                </button>
              </div>
            </>
          ) : (
            <div className="recent-empty" role="menuitem">
              No recent files
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

