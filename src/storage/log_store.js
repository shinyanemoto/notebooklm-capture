'use strict';

(() => {
  const STORAGE_KEY = 'captureLogs';
  const MAX_LOGS = 500;

  function normalizeEntry(entry) {
    return {
      memo: String(entry?.memo || ''),
      tags: Array.isArray(entry?.tags) ? entry.tags.filter(Boolean).map(String) : [],
      timestamp: entry?.timestamp || new Date().toISOString(),
      sourcePage: {
        title: entry?.sourcePage?.title || '',
        url: entry?.sourcePage?.url || '',
        hostname: entry?.sourcePage?.hostname || ''
      }
    };
  }

  async function getLogs() {
    const result = await chrome.storage.local.get({
      [STORAGE_KEY]: []
    });

    return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
  }

  async function saveLogs(logs) {
    await chrome.storage.local.set({
      [STORAGE_KEY]: logs.slice(0, MAX_LOGS)
    });
  }

  async function addLog(entry) {
    const logs = await getLogs();
    const nextLogs = [normalizeEntry(entry), ...logs].slice(0, MAX_LOGS);
    await saveLogs(nextLogs);
    return nextLogs[0];
  }

  async function clearLogs() {
    await chrome.storage.local.set({
      [STORAGE_KEY]: []
    });
  }

  window.NotebookLMCaptureLogStore = {
    getLogs,
    addLog,
    clearLogs
  };
})();
