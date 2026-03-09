'use strict';

(() => {
  const NOTEBOOK_HOST = 'notebooklm.google.com';
  const DEFAULT_NOTEBOOK_URL = `https://${NOTEBOOK_HOST}/`;
  const INPUT_SELECTORS = [
    'textarea[aria-label*="message" i]',
    'textarea[placeholder*="message" i]',
    'textarea'
  ];
  const SEND_BUTTON_SELECTORS = [
    'button[aria-label*="send" i]',
    'button[data-testid*="send" i]',
    'button[type="submit"]'
  ];

  function findInputElement() {
    for (const selector of INPUT_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function findSendButton() {
    for (const selector of SEND_BUTTON_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function setReactInputValue(input, value) {
    const prototype = Object.getPrototypeOf(input);
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (descriptor?.set) {
      descriptor.set.call(input, value);
    } else {
      input.value = value;
    }

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function insertAndSendOnCurrentPage(memoText) {
    if (!location.hostname.includes(NOTEBOOK_HOST)) {
      throw new Error('not_notebooklm_page');
    }

    const input = findInputElement();
    if (!input) {
      throw new Error('chat_input_not_found');
    }

    setReactInputValue(input, memoText);

    const sendButton = findSendButton();
    if (sendButton) {
      sendButton.click();
      return { ok: true, method: 'button' };
    }

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Enter',
        code: 'Enter'
      })
    );

    return { ok: true, method: 'enter' };
  }

  async function queryNotebookTab() {
    if (!chrome?.tabs?.query) {
      return null;
    }

    const tabs = await chrome.tabs.query({
      url: [`*://${NOTEBOOK_HOST}/*`]
    });

    if (!tabs.length) {
      return null;
    }

    const activeTab = tabs.find((tab) => tab.active);
    return activeTab || tabs[0];
  }

  async function openNotebookTab(notebookUrl) {
    if (!chrome?.tabs?.create) {
      window.open(notebookUrl || DEFAULT_NOTEBOOK_URL, '_blank', 'noopener');
      return null;
    }

    return chrome.tabs.create({ url: notebookUrl || DEFAULT_NOTEBOOK_URL, active: true });
  }

  async function sendToNotebookTab(tabId, memoText) {
    if (!chrome?.tabs?.sendMessage) {
      return { ok: false, reason: 'tabs_sendMessage_unavailable' };
    }

    return chrome.tabs.sendMessage(tabId, {
      type: 'NOTEBOOKLM_CAPTURE_INSERT_AND_SEND',
      payload: { memoText }
    });
  }

  async function sendMemo(memoText, notebookUrl) {
    const text = (memoText || '').trim();
    if (!text) {
      return { ok: false, reason: 'empty_memo' };
    }

    if (location.hostname.includes(NOTEBOOK_HOST)) {
      return insertAndSendOnCurrentPage(text);
    }

    const targetTab = await queryNotebookTab();
    if (!targetTab) {
      await openNotebookTab(notebookUrl);
      return { ok: false, reason: 'notebook_tab_missing_opened' };
    }

    const response = await sendToNotebookTab(targetTab.id, text);
    return response || { ok: true };
  }

  chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'NOTEBOOKLM_CAPTURE_INSERT_AND_SEND') {
      return false;
    }

    insertAndSendOnCurrentPage(message.payload?.memoText || '')
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          reason: error?.message || 'send_failed'
        })
      );

    return true;
  });

  window.NotebookLMCaptureSender = {
    sendMemo,
    insertAndSendOnCurrentPage
  };
})();
