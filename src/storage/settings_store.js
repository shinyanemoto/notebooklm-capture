'use strict';

(() => {
  const STORAGE_KEY = 'settings';

  const DEFAULT_SETTINGS = {
    notebooks: [],
    ui: {
      position: 'bottom-right',
      startCollapsed: false,
      floatingButtonOffset: null
    },
    tagPresets: ['todo', 'research', 'idea']
  };

  function normalize(settings) {
    const notebooks = Array.isArray(settings?.notebooks)
      ? settings.notebooks
          .map((item) => {
            if (!item || !item.url) {
              return null;
            }

            const url = String(item.url).trim();
            if (!url) {
              return null;
            }

            const name = String(item.name || 'Notebook').trim() || 'Notebook';
            return { name, url };
          })
          .filter(Boolean)
      : [];

    const position = settings?.ui?.position || DEFAULT_SETTINGS.ui.position;
    const startCollapsed = Boolean(settings?.ui?.startCollapsed);
    const offset = settings?.ui?.floatingButtonOffset;
    const floatingButtonOffset =
      offset &&
      Number.isFinite(offset.top)
        ? {
            top: Math.max(0, Math.round(offset.top))
          }
        : null;

    const tagPresets = Array.isArray(settings?.tagPresets)
      ? settings.tagPresets.filter(Boolean).map((tag) => String(tag).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.tagPresets.slice();

    return {
      notebooks,
      ui: {
        position,
        startCollapsed,
        floatingButtonOffset
      },
      tagPresets
    };
  }

  async function getSettings() {
    const result = await chrome.storage.local.get({
      [STORAGE_KEY]: DEFAULT_SETTINGS
    });

    return normalize(result[STORAGE_KEY]);
  }

  async function saveSettings(settings) {
    const current = await getSettings();
    const normalized = normalize({
      ...current,
      ...settings,
      ui: {
        ...current.ui,
        ...settings?.ui
      }
    });
    await chrome.storage.local.set({
      [STORAGE_KEY]: normalized
    });
    return normalized;
  }

  async function resetSettings() {
    await chrome.storage.local.set({
      [STORAGE_KEY]: DEFAULT_SETTINGS
    });
    return DEFAULT_SETTINGS;
  }

  const api = {
    DEFAULT_SETTINGS,
    getSettings,
    saveSettings,
    resetSettings
  };

  if (typeof window !== 'undefined') {
    window.NotebookLMCaptureSettingsStore = api;
  } else {
    self.NotebookLMCaptureSettingsStore = api;
  }
})();
