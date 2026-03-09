'use strict';

const LogStore = {
  async getAll() {
    const result = await chrome.storage.local.get({ captureLogs: [] });
    return result.captureLogs;
  },
  async add(entry) {
    const logs = await this.getAll();
    logs.push(entry);
    await chrome.storage.local.set({ captureLogs: logs });
    return entry;
  }
};
