'use strict';

(() => {
  const NOTEBOOK_HOST = 'notebooklm.google.com';
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

  function findBySelectors(selectors) {
    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
    }
    return null;
  }

  function findInputElement() {
    return findBySelectors(INPUT_SELECTORS);
  }

  function findSendButton() {
    return findBySelectors(SEND_BUTTON_SELECTORS);
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

  function waitForInput(timeoutMs = 8000) {
    const existing = findInputElement();
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const input = findInputElement();
        if (!input) {
          return;
        }

        observer.disconnect();
        clearTimeout(timer);
        resolve(input);
      });

      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });

      const timer = setTimeout(() => {
        observer.disconnect();
        reject(new Error('chat_input_not_found'));
      }, timeoutMs);
    });
  }

  async function insertAndSendOnCurrentPage(memoText) {
    if (!location.hostname.includes(NOTEBOOK_HOST)) {
      throw new Error('not_notebooklm_page');
    }

    const text = String(memoText || '').trim();
    if (!text) {
      throw new Error('empty_memo');
    }

    const input = await waitForInput();
    setReactInputValue(input, text);

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

    input.dispatchEvent(
      new KeyboardEvent('keyup', {
        bubbles: true,
        key: 'Enter',
        code: 'Enter'
      })
    );

    return { ok: true, method: 'enter' };
  }

  chrome?.runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'NOTEBOOKLM_CAPTURE_INSERT_AND_SEND') {
      return false;
    }

    insertAndSendOnCurrentPage(message.payload?.memoText || '')
      .then((result) => sendResponse(result))
      .catch((error) => {
        sendResponse({
          ok: false,
          reason: error?.message || 'send_failed'
        });
      });

    return true;
  });

  window.NotebookLMCaptureSender = {
    insertAndSendOnCurrentPage
  };
})();
