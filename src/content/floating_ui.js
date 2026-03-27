'use strict';

(() => {
  if (window.top !== window || window.__notebookCaptureFloatingUiLoaded) {
    return;
  }
  window.__notebookCaptureFloatingUiLoaded = true;

  const STATE = {
    tags: new Set(),
    drag: {
      active: false,
      pointerId: null,
      startPointerY: 0,
      startTop: 0,
      holdTimer: null,
      suppressToggleClick: false
    }
  };

  const DEFAULT_TAG_OPTIONS = ['todo', 'research', 'idea'];
  const DEFAULT_BUTTON_MARGIN = 16;
  const DRAG_HOLD_MS = 260;

  const style = document.createElement('style');
  style.textContent = `
    .nlm-capture-root {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111;
    }
    .nlm-capture-button {
      width: 48px;
      height: 48px;
      border-radius: 24px;
      border: none;
      background: #0b57d0;
      color: #fff;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.25);
      touch-action: none;
    }
    .nlm-capture-button.dragging {
      cursor: grabbing;
      opacity: 0.9;
    }
    .nlm-capture-panel {
      width: fit-content;
      min-width: 280px;
      max-width: calc(100vw - 32px);
      box-sizing: border-box;
      margin-bottom: 10px;
      background: #fff;
      border: 1px solid #ddd;
      border-radius: 10px;
      box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
      padding: 10px;
      display: none;
    }
    .nlm-capture-panel.open {
      display: block;
    }
    .nlm-capture-panel textarea {
      width: 280px;
      box-sizing: border-box;
      max-width: calc(100vw - 52px);
      resize: both;
      overflow: auto;
      min-height: 80px;
    }
    .nlm-capture-tags {
      display: flex;
      gap: 6px;
      margin: 8px 0;
      flex-wrap: wrap;
    }
    .nlm-capture-tag {
      border: 1px solid #ccc;
      background: #f4f4f4;
      border-radius: 10px;
      padding: 2px 8px;
      font-size: 11px;
      cursor: pointer;
    }
    .nlm-capture-tag.active {
      background: #d3e3fd;
      border-color: #0b57d0;
    }
    .nlm-capture-send {
      flex: 1 1 0;
      border: none;
      border-radius: 8px;
      background: #0b57d0;
      color: #fff;
      padding: 8px;
      cursor: pointer;
      font-weight: 600;
    }
    .nlm-capture-send-row {
      display: flex;
      gap: 8px;
      margin-top: 8px;
    }
    .nlm-capture-send.gemini {
      background: #1a73e8;
    }
    .nlm-capture-target-select {
      width: 100%;
      box-sizing: border-box;
      margin-top: 8px;
      padding: 8px;
      border: 1px solid #d0d0d0;
      border-radius: 8px;
      background: #fff;
      font-size: 12px;
    }
  `;

  const root = document.createElement('div');
  root.className = 'nlm-capture-root';

  const panel = document.createElement('div');
  panel.className = 'nlm-capture-panel';

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Quick memo...';

  const tags = document.createElement('div');
  tags.className = 'nlm-capture-tags';

  const geminiTargetSelect = document.createElement('select');
  geminiTargetSelect.className = 'nlm-capture-target-select';
  geminiTargetSelect.style.display = 'none';

  const statusLine = document.createElement('div');
  statusLine.style.marginTop = '8px';
  statusLine.style.fontSize = '12px';
  statusLine.style.minHeight = '16px';
  statusLine.style.color = '#0b57d0';

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  async function loadSettings() {
    if (!chrome?.storage?.local?.get) {
      return {
        ui: {
          floatingButtonOffset: null
        },
        tagPresets: DEFAULT_TAG_OPTIONS
      };
    }

    const result = await chrome.storage.local.get({
      settings: {
        ui: {
          floatingButtonOffset: null
        },
        tagPresets: DEFAULT_TAG_OPTIONS
      }
    });

    return result.settings || {
      ui: {
        floatingButtonOffset: null
      },
      tagPresets: DEFAULT_TAG_OPTIONS
    };
  }

  function getButtonBounds() {
    return {
      width: toggleButton.offsetWidth || 48,
      height: toggleButton.offsetHeight || 48
    };
  }

  function applyFloatingButtonOffset(offset) {
    if (!offset) {
      root.style.left = '';
      root.style.top = '';
      root.style.right = `${DEFAULT_BUTTON_MARGIN}px`;
      root.style.bottom = `${DEFAULT_BUTTON_MARGIN}px`;
      return;
    }

    const bounds = getButtonBounds();
    const maxTop = Math.max(DEFAULT_BUTTON_MARGIN, window.innerHeight - bounds.height - DEFAULT_BUTTON_MARGIN);

    root.style.top = `${clamp(offset.top, DEFAULT_BUTTON_MARGIN, maxTop)}px`;
    root.style.left = 'auto';
    root.style.right = `${DEFAULT_BUTTON_MARGIN}px`;
    root.style.bottom = 'auto';
  }

  async function saveFloatingButtonOffset(offset) {
    if (!chrome?.storage?.local?.get || !chrome?.storage?.local?.set) {
      return;
    }

    const settings = await loadSettings();
    const nextSettings = {
      ...settings,
      ui: {
        ...(settings.ui || {}),
        floatingButtonOffset: offset
      }
    };

    await chrome.storage.local.set({
      settings: nextSettings
    });
  }

  function getCurrentOffset() {
    const rect = root.getBoundingClientRect();
    return {
      top: Math.round(rect.top)
    };
  }

  function positionPanel() {
    const buttonRect = toggleButton.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 300;
    const panelHeight = panel.offsetHeight || 260;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spacing = 10;

    const spaceAbove = buttonRect.top - DEFAULT_BUTTON_MARGIN;
    const spaceBelow = viewportHeight - buttonRect.bottom - DEFAULT_BUTTON_MARGIN;

    const shouldOpenBelow = spaceAbove < panelHeight && spaceBelow > spaceAbove;
    const desiredTop = shouldOpenBelow
      ? buttonRect.height + spacing
      : -(panelHeight + spacing);

    const minTop = DEFAULT_BUTTON_MARGIN - buttonRect.top;
    const maxTop = viewportHeight - DEFAULT_BUTTON_MARGIN - buttonRect.top - panelHeight;
    const panelTop = clamp(desiredTop, minTop, maxTop);

    const desiredLeft = Math.min(0, buttonRect.width - panelWidth);
    const minLeft = DEFAULT_BUTTON_MARGIN - buttonRect.left;
    const maxLeft = viewportWidth - DEFAULT_BUTTON_MARGIN - buttonRect.left - panelWidth;
    const panelLeft = clamp(desiredLeft, minLeft, maxLeft);

    panel.style.position = 'absolute';
    panel.style.marginBottom = '0';
    panel.style.left = `${panelLeft}px`;
    panel.style.top = `${panelTop}px`;
  }

  function normalizeTagPresets(rawValue) {
    if (!Array.isArray(rawValue)) {
      return DEFAULT_TAG_OPTIONS.slice();
    }

    const normalized = rawValue
      .map((tag) => String(tag).trim())
      .filter(Boolean);

    return normalized.length ? normalized : DEFAULT_TAG_OPTIONS.slice();
  }

  function renderTagButtons(tagOptions) {
    STATE.tags.clear();
    tags.innerHTML = '';

    tagOptions.forEach((tag) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'nlm-capture-tag';
      button.textContent = tag;
      button.addEventListener('click', () => {
        if (STATE.tags.has(tag)) {
          STATE.tags.delete(tag);
          button.classList.remove('active');
        } else {
          STATE.tags.add(tag);
          button.classList.add('active');
        }
      });
      tags.appendChild(button);
    });
  }

  async function loadTagButtonsFromSettings() {
    const settings = await loadSettings();
    const tagOptions = normalizeTagPresets(settings?.tagPresets);
    renderTagButtons(tagOptions);
  }

  renderTagButtons(DEFAULT_TAG_OPTIONS);
  loadTagButtonsFromSettings().catch(() => {
    renderTagButtons(DEFAULT_TAG_OPTIONS);
  });

  const sendRow = document.createElement('div');
  sendRow.className = 'nlm-capture-send-row';

  const notebookSendButton = document.createElement('button');
  notebookSendButton.type = 'button';
  notebookSendButton.className = 'nlm-capture-send';
  notebookSendButton.textContent = 'Send to NotebookLM';

  const geminiSendButton = document.createElement('button');
  geminiSendButton.type = 'button';
  geminiSendButton.className = 'nlm-capture-send gemini';
  geminiSendButton.textContent = 'Send to Gemini';

  async function requestSend(detail) {
    if (!chrome?.runtime?.sendMessage) {
      return { ok: false, reason: 'runtime_unavailable' };
    }

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ ok: false, reason: 'send_timeout' });
      }, 15000);

      chrome.runtime.sendMessage(
        {
          type: 'NOTEBOOKLM_CAPTURE_SEND_REQUEST',
          payload: detail
        },
        (response) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            resolve({ ok: false, reason: chrome.runtime.lastError.message });
            return;
          }
          resolve(response || { ok: false, reason: 'no_response' });
        }
      );
    });
  }

  async function requestGeminiTabs() {
    if (!chrome?.runtime?.sendMessage) {
      return [];
    }

    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'NOTEBOOKLM_CAPTURE_LIST_GEMINI_TABS' },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve([]);
            return;
          }
          resolve(Array.isArray(response?.tabs) ? response.tabs : []);
        }
      );
    });
  }

  function truncateLabel(text) {
    const value = String(text || '').trim();
    if (value.length <= 48) {
      return value;
    }
    return `${value.slice(0, 45)}...`;
  }

  function buildGeminiOptionLabel(tab, index) {
    const numberLabel = `Gemini ${index + 1}`;
    const stateLabel = tab.active ? 'Current' : numberLabel;
    const hintSource = tab.pathHint || tab.title || tab.url || `tab-${tab.id}`;
    return truncateLabel(`${stateLabel} | ${hintSource}`);
  }

  async function refreshGeminiTabOptions() {
    const tabs = await requestGeminiTabs();
    geminiTargetSelect.innerHTML = '';

    const autoOption = document.createElement('option');
    autoOption.value = '';
    autoOption.textContent = tabs.length ? 'Auto select Gemini tab' : 'Auto select Gemini tab (none open)';
    geminiTargetSelect.appendChild(autoOption);

    tabs.forEach((tab, index) => {
      const option = document.createElement('option');
      option.value = String(tab.id);
      option.textContent = buildGeminiOptionLabel(tab, index);
      geminiTargetSelect.appendChild(option);
    });

    geminiTargetSelect.style.display = 'block';
  }

  function resetTagsUI() {
    STATE.tags.clear();
    tags.querySelectorAll('.nlm-capture-tag.active').forEach((el) => {
      el.classList.remove('active');
    });
  }

  function setSendingState(isSending) {
    notebookSendButton.disabled = isSending;
    geminiSendButton.disabled = isSending;
  }

  async function handleSend(target) {
    const memo = textarea.value.trim();
    if (!memo) {
      textarea.focus();
      return;
    }

    const context = window.NotebookLMCaptureContextExtractor?.extractContext?.() || {
      timestamp: new Date().toISOString(),
      title: document.title || '',
      url: location.href,
      hostname: location.hostname
    };

    const detail = {
      memo,
      tags: Array.from(STATE.tags),
      context,
      target
    };

    if (target === 'gemini' && geminiTargetSelect.value) {
      detail.geminiTabId = Number(geminiTargetSelect.value);
    }

    window.dispatchEvent(
      new CustomEvent('notebooklm-capture:send', { detail })
    );

    setSendingState(true);
    statusLine.textContent = 'Sending...';
    const response = await requestSend(detail);
    setSendingState(false);

    if (response?.ok) {
      statusLine.style.color = '#0b57d0';
      statusLine.textContent = target === 'gemini' ? 'Sent to Gemini' : 'Sent to NotebookLM';
      textarea.value = '';
      resetTagsUI();
      return;
    }

    statusLine.style.color = '#c5221f';
    statusLine.textContent = `Failed: ${response?.reason || 'send_failed'}`;
    setTimeout(() => {
      statusLine.style.color = '#0b57d0';
    }, 1200);
  }

  notebookSendButton.addEventListener('click', () => {
    handleSend('notebooklm');
  });

  geminiSendButton.addEventListener('click', () => {
    handleSend('gemini');
  });

  sendRow.append(notebookSendButton, geminiSendButton);

  panel.append(textarea, tags, geminiTargetSelect, sendRow, statusLine);

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'nlm-capture-button';
  toggleButton.textContent = 'Memo';
  toggleButton.addEventListener('click', async () => {
    if (STATE.drag.suppressToggleClick) {
      STATE.drag.suppressToggleClick = false;
      return;
    }

    const isOpen = panel.classList.toggle('open');
    if (isOpen) {
      positionPanel();
      await refreshGeminiTabOptions();
      positionPanel();
    }
  });

  function stopHoldTimer() {
    if (STATE.drag.holdTimer) {
      clearTimeout(STATE.drag.holdTimer);
      STATE.drag.holdTimer = null;
    }
  }

  function startDragging(event) {
    const offset = getCurrentOffset();
    STATE.drag.active = true;
    STATE.drag.pointerId = event.pointerId;
    STATE.drag.startPointerY = event.clientY;
    STATE.drag.startTop = offset.top;
    toggleButton.classList.add('dragging');

    if (toggleButton.setPointerCapture) {
      toggleButton.setPointerCapture(event.pointerId);
    }
  }

  function stopDragging() {
    STATE.drag.active = false;
    toggleButton.classList.remove('dragging');
  }

  toggleButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }

    stopHoldTimer();
    STATE.drag.pointerId = event.pointerId;
    const pointerSnapshot = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY
    };
    STATE.drag.holdTimer = setTimeout(() => {
      startDragging(pointerSnapshot);
      panel.classList.remove('open');
      STATE.drag.holdTimer = null;
    }, DRAG_HOLD_MS);
  });

  toggleButton.addEventListener('pointermove', (event) => {
    if (!STATE.drag.active || STATE.drag.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    const deltaY = event.clientY - STATE.drag.startPointerY;
    applyFloatingButtonOffset({
      top: STATE.drag.startTop + deltaY
    });
  });

  async function finishDrag(event) {
    if (STATE.drag.active && STATE.drag.pointerId === event.pointerId) {
      STATE.drag.suppressToggleClick = true;
      const offset = getCurrentOffset();
      stopDragging();
      await saveFloatingButtonOffset(offset);
    }

    stopHoldTimer();
    if (toggleButton.releasePointerCapture && STATE.drag.pointerId === event.pointerId) {
      try {
        toggleButton.releasePointerCapture(event.pointerId);
      } catch (_error) {
        // Ignore capture release errors.
      }
    }
    STATE.drag.pointerId = null;
  }

  toggleButton.addEventListener('pointerup', (event) => {
    finishDrag(event);
  });

  toggleButton.addEventListener('pointercancel', (event) => {
    finishDrag(event);
  });

  window.addEventListener('resize', () => {
    applyFloatingButtonOffset(getCurrentOffset());
    if (panel.classList.contains('open')) {
      positionPanel();
    }
  });

  root.append(panel, toggleButton);
  document.documentElement.append(style, root);

  loadSettings()
    .then((settings) => {
      applyFloatingButtonOffset(settings?.ui?.floatingButtonOffset || null);
    })
    .catch(() => {
      applyFloatingButtonOffset(null);
    });
})();
