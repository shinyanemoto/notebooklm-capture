'use strict';

(() => {
  const store = window.NotebookLMCaptureSettingsStore;

  function parseNotebooks(rawText) {
    return rawText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        if (!line.includes('|')) {
          try {
            const parsed = new URL(line);
            return {
              name: parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname,
              url: parsed.toString()
            };
          } catch (_error) {
            return {
              name: '',
              url: ''
            };
          }
        }

        const [name, ...urlParts] = line.split('|');
        return {
          name: (name || '').trim(),
          url: urlParts.join('|').trim()
        };
      })
      .filter((item) => item.name && item.url);
  }

  function formatNotebooks(notebooks) {
    return notebooks.map((item) => `${item.name}|${item.url}`).join('\n');
  }

  function showStatus(message) {
    const el = document.getElementById('status');
    el.textContent = message;
    setTimeout(() => {
      if (el.textContent === message) {
        el.textContent = '';
      }
    }, 2000);
  }

  async function load() {
    const settings = await store.getSettings();

    document.getElementById('notebooks').value = formatNotebooks(settings.notebooks);
    document.getElementById('position').value = settings.ui.position;
    document.getElementById('startCollapsed').checked = settings.ui.startCollapsed;
    document.getElementById('tags').value = settings.tagPresets.join(',');
  }

  async function save() {
    const notebooks = parseNotebooks(document.getElementById('notebooks').value);
    const position = document.getElementById('position').value;
    const startCollapsed = document.getElementById('startCollapsed').checked;
    const tagPresets = document
      .getElementById('tags')
      .value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

    await store.saveSettings({
      notebooks,
      ui: {
        position,
        startCollapsed
      },
      tagPresets
    });

    showStatus('Saved');
  }

  async function reset() {
    await store.resetSettings();
    await load();
    showStatus('Reset to defaults');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('save').addEventListener('click', save);
    document.getElementById('reset').addEventListener('click', reset);
    await load();
  });
})();
