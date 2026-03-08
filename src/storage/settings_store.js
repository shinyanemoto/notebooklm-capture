'use strict';

const SettingsStore = {
  async getAll() {
    const result = await chrome.storage.local.get({ settings: {} });
    return result.settings;
  },
  async setAll(settings) {
    await chrome.storage.local.set({ settings });
    return settings;
  }
};
