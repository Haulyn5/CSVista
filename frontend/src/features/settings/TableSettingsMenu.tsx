import { useEffect, useRef, useState } from "react";
import { Settings2 } from "lucide-react";

import type { DisplaySettings } from "./types";

export function TableSettingsMenu({
  displaySettings,
  onUpdateDisplaySettings
}: {
  displaySettings: DisplaySettings;
  onUpdateDisplaySettings: (settings: DisplaySettings) => void;
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
    <div className="settings-menu" ref={menuRef}>
      <button
        type="button"
        className="secondary-button settings-button"
        aria-controls="table-display-settings"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((currentOpen) => !currentOpen)}
      >
        <Settings2 size={16} />
        Settings
      </button>
      {open ? (
        <div className="settings-popover" id="table-display-settings" role="group" aria-label="Table display settings">
          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={displaySettings.showCellNewlines}
              onChange={(event) =>
                onUpdateDisplaySettings({
                  ...displaySettings,
                  showCellNewlines: event.target.checked
                })
              }
            />
            <span>
              <strong>Show cell line breaks</strong>
              <small>Render newline characters inside cell values.</small>
            </span>
          </label>
        </div>
      ) : null}
    </div>
  );
}

