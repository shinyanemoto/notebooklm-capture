'use strict';

(() => {
  if (window.top !== window || window.__notebookCaptureFloatingUiLoaded) {
    return;
  }
  window.__notebookCaptureFloatingUiLoaded = true;

  const STATE = {
    tags: new Set()
  };

  const TAG_OPTIONS = ['todo', 'research', 'idea'];

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
    }
    .nlm-capture-panel {
      width: 280px;
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
      width: 100%;
      box-sizing: border-box;
      resize: vertical;
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
      padding: 8px;
      cursor: pointer;
      font-weight: 600;
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

  TAG_OPTIONS.forEach((tag) => {
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

  const sendButton = document.createElement('button');
  sendButton.type = 'button';
  sendButton.className = 'nlm-capture-send';
  sendButton.textContent = 'Send';

  sendButton.addEventListener('click', () => {
    const memo = textarea.value.trim();
    if (!memo) {
      textarea.focus();
      return;
    }

    const detail = {
      memo,
      tags: Array.from(STATE.tags)
    };

    window.dispatchEvent(
      new CustomEvent('notebooklm-capture:send', { detail })
    );

    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'NOTEBOOKLM_CAPTURE_SEND_REQUEST',
        payload: detail
      });
    }

    textarea.value = '';
    STATE.tags.clear();
    tags.querySelectorAll('.nlm-capture-tag.active').forEach((el) => {
      el.classList.remove('active');
    });
  });

  panel.append(textarea, tags, sendButton);

  const toggleButton = document.createElement('button');
  toggleButton.type = 'button';
  toggleButton.className = 'nlm-capture-button';
  toggleButton.textContent = 'Memo';
  toggleButton.addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  root.append(panel, toggleButton);
  document.documentElement.append(style, root);
})();
