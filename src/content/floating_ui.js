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

  const DEFAULT_TAG_OPTIONS = ['todo', 'research', 'idea', 'memo'];
  const DEFAULT_BUTTON_MARGIN = 16;
  const DRAG_HOLD_MS = 260;
  const PANEL_BUTTON_GAP = 12;

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
      width: 100%;
      border: none;
      border-radius: 8px;
      background: #0b57d0;
      color: #fff;
      padding: 10px;
      cursor: pointer;
      font-weight: 600;
      margin-top: 8px;
    }
    .nlm-capture-send:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
  `;

  const root = document.createElement('div');
  root.className = 'nlm-capture-root';

  const panel = document.createElement('div');
  panel.className = 'nlm-capture-panel';

  const textarea = document.createElement('textarea');
  textarea.placeholder = 'Inboxに放り込む...';

  const tags = document.createElement('div');
  tags.className = 'nlm-capture-tags';

  const statusLine = document.createElement('div');
  statusLine.style.marginTop = '8px';
  statusLine.style.fontSize = '12px';
  statusLine.style.minHeight = '16px';
  statusLine.style.color = '#0b57d0';

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'nlm-capture-send';
  sendButton.textContent = 'Send to Inbox';

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  async function loadSettings() {
    if (!chrome?.storage?.local?.get) {
      return {
        tagPresets: DEFAULT_TAG_OPTIONS
      };
    }

    const result = await chrome.storage.local.get({
      settings: {
        tagPresets: DEFAULT_TAG_OPTIONS
      }
    });

    return result.settings || {
      tagPresets: DEFAULT_TAG_OPTIONS
    };
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

  function getButtonBounds() {
    return {
      width: toggleButton.offsetWidth || 48,
      height: toggleButton.offsetHeight || 48
    };
  }

  function positionPanel() {
    const buttonRect = toggleButton.getBoundingClientRect();
    const panelWidth = panel.offsetWidth || 300;
    const panelHeight = panel.offsetHeight || 200;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const spacing = PANEL_BUTTON_GAP;

    const spaceAbove = buttonRect.top - DEFAULT_BUTTON_MARGIN;
    const spaceBelow = viewportHeight - buttonRect.bottom - DEFAULT_BUTTON_MARGIN;

    const shouldOpenBelow = spaceAbove < panelHeight && spaceBelow > spaceAbove;
    const desiredTop = shouldOpenBelow
      ? buttonRect.height + spacing
      : -(panelHeight + spacing);

    const minTop = DEFAULT_BUTTON_MARGIN - buttonRect.top;
    const maxTop = viewportHeight - DEFAULT_BUTTON_MARGIN - buttonRect.top - panelHeight;
    const panelTop = clamp(desiredTop, minTop, maxTop);

    const desiredLeft = -(panelWidth + spacing);
    const minLeft = DEFAULT_BUTTON_MARGIN - buttonRect.left;
    const maxLeft = viewportWidth - DEFAULT_BUTTON_MARGIN - buttonRect.left - panelWidth;
    const panelLeft = clamp(desiredLeft, minLeft, maxLeft);

    panel.style.position = 'absolute';
    panel.style.marginBottom = '0';
    panel.style.left = `${panelLeft}px`;
    panel.style.top = `${panelTop}px`;
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
        const isActive = STATE.tags.has(tag);
        STATE.tags.clear();
        tags.querySelectorAll('.nlm-capture-tag.active').forEach(el => el.classList.remove('active'));

        if (!isActive) {
          STATE.tags.add(tag);
          button.classList.add('active');
        }
      });
      tags.appendChild(button);
    });
  }

  async function loadTagButtonsFromSettings() {
    const settings = await loadSettings();
    renderTagButtons(normalizeTagPresets(settings?.tagPresets));
  }

  renderTagButtons(DEFAULT_TAG_OPTIONS);
  loadTagButtonsFromSettings().catch(() => {
    renderTagButtons(DEFAULT_TAG_OPTIONS);
  });

  function resetTagsUI() {
    STATE.tags.clear();
    tags.querySelectorAll('.nlm-capture-tag.active').forEach((el) => {
      el.classList.remove('active');
    });
  }

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

  function formatErrorMessage(reason) {
    if (reason === 'inbox_web_app_url_missing') {
      return 'Set the GAS Web App URL in extension settings';
    }

    if (typeof reason === 'string' && reason.startsWith('inbox_http_')) {
      return `Inbox request failed (${reason.replace('inbox_http_', 'HTTP ')})`;
    }

    return reason || 'send_failed';
  }

  async function handleSend() {
    const memo = textarea.value.trim();
    if (!memo) {
      textarea.focus();
      return;
    }

    sendButton.disabled = true;
    statusLine.textContent = 'Sending...';
    statusLine.style.color = '#0b57d0';

    const context = window.NotebookLMCaptureContextExtractor?.extractContext?.() || {
      timestamp: new Date().toISOString(),
      title: document.title || '',
      url: location.href,
      hostname: location.hostname
    };

    try {
      const response = await requestSend({
        memo,
        tags: Array.from(STATE.tags),
        context,
        target: 'inbox'
      });
      if (!response?.ok) {
        throw new Error(response?.reason || 'send_failed');
      }

      statusLine.textContent = 'Sent to Inbox';
      textarea.value = '';
      resetTagsUI();

      setTimeout(() => {
        panel.classList.remove('open');
        statusLine.textContent = '';
      }, 1000);

    } catch (error) {
      statusLine.style.color = '#c5221f';
      statusLine.textContent = `Failed: ${formatErrorMessage(error?.message)}`;
    } finally {
      sendButton.disabled = false;
    }
  }

  sendButton.addEventListener('click', handleSend);

  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      handleSend();
    }
  });

  panel.append(textarea, tags, sendButton, statusLine);

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
      textarea.focus();
    }
  });

  function stopHoldTimer() {
    if (STATE.drag.holdTimer) {
      clearTimeout(STATE.drag.holdTimer);
      STATE.drag.holdTimer = null;
    }
  }

  function startDragging(event) {
    const rect = root.getBoundingClientRect();
    STATE.drag.active = true;
    STATE.drag.pointerId = event.pointerId;
    STATE.drag.startPointerY = event.clientY;
    STATE.drag.startTop = Math.round(rect.top);
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
    if (event.button !== 0) return;
    stopHoldTimer();
    STATE.drag.pointerId = event.pointerId;
    const pointerSnapshot = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY };
    STATE.drag.holdTimer = setTimeout(() => {
      startDragging(pointerSnapshot);
      panel.classList.remove('open');
      STATE.drag.holdTimer = null;
    }, DRAG_HOLD_MS);
  });

  toggleButton.addEventListener('pointermove', (event) => {
    if (!STATE.drag.active || STATE.drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaY = event.clientY - STATE.drag.startPointerY;
    const bounds = getButtonBounds();
    const maxTop = Math.max(DEFAULT_BUTTON_MARGIN, window.innerHeight - bounds.height - DEFAULT_BUTTON_MARGIN);
    const newTop = clamp(STATE.drag.startTop + deltaY, DEFAULT_BUTTON_MARGIN, maxTop);

    root.style.top = `${newTop}px`;
    root.style.left = 'auto';
    root.style.right = `${DEFAULT_BUTTON_MARGIN}px`;
    root.style.bottom = 'auto';
  });

  function finishDrag(event) {
    if (STATE.drag.active && STATE.drag.pointerId === event.pointerId) {
      STATE.drag.suppressToggleClick = true;
      stopDragging();
    }
    stopHoldTimer();
    if (toggleButton.releasePointerCapture && STATE.drag.pointerId === event.pointerId) {
      try { toggleButton.releasePointerCapture(event.pointerId); } catch (_e) {}
    }
    STATE.drag.pointerId = null;
  }

  toggleButton.addEventListener('pointerup', finishDrag);
  toggleButton.addEventListener('pointercancel', finishDrag);

  window.addEventListener('resize', () => {
    if (panel.classList.contains('open')) {
      positionPanel();
    }
  });

  root.append(panel, toggleButton);
  document.documentElement.append(style, root);

})();
