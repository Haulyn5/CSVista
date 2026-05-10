import { useState } from "react";

import { loadDisplaySettings, storeDisplaySettings } from "./displaySettingsStorage";
import type { DisplaySettings } from "./types";

export function useDisplaySettings() {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => loadDisplaySettings());

  function updateDisplaySettings(nextSettings: DisplaySettings) {
    setDisplaySettings(nextSettings);
    storeDisplaySettings(nextSettings);
  }

  return {
    displaySettings,
    updateDisplaySettings
  };
}

