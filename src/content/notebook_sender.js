'use strict';

(() => {
  if (window.__notebookCaptureSenderLoaded) {
    return;
  }
  window.__notebookCaptureSenderLoaded = true;

  const NOTEBOOK_HOST = 'notebooklm.google.com';
  const INPUT_SELECTORS = [
    'textarea',
    'div[contenteditable="true"][role="textbox"]',
    '[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"]',
    'input[type="text"]'
  ];
  const SEND_BUTTON_SELECTORS = [
    'button[aria-label*="send" i]',
    'button[aria-label*="送信" i]',
    'button[type="submit"]',
    'button[data-testid*="send" i]'
  ];

  function isVisible(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  }

  function getEditableCandidates() {
    const candidates = [];

    for (const selector of INPUT_SELECTORS) {
      document.querySelectorAll(selector).forEach((element) => {
        if (!isVisible(element)) {
          return;
        }

        if (element.disabled || element.readOnly) {
          return;
        }

        if (!candidates.includes(element)) {
          candidates.push(element);
        }
      });
    }

    return candidates;
  }

  function scoreInputElement(element) {
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const centerX = rect.left + rect.width / 2;

    let score = 0;

    if (rect.width >= 280) {
      score += 2;
    }

    if (rect.bottom >= viewportHeight * 0.55) {
      score += 3;
    }

    if (centerX >= viewportWidth * 0.25 && centerX <= viewportWidth * 0.75) {
      score += 4;
    }

    const hint = `${element.getAttribute('aria-label') || ''} ${element.getAttribute('placeholder') || ''}`;
    if (/chat|message|入力|メッセージ/i.test(hint)) {
      score += 4;
    }

    if (element.closest('form')) {
      score += 1;
    }

    return score;
  }

  function findBestInputElement() {
    const candidates = getEditableCandidates();
    if (!candidates.length) {
      return null;
    }

    candidates.sort((a, b) => scoreInputElement(b) - scoreInputElement(a));
    return candidates[0];
  }

  function getSendButtons() {
    const buttons = [];

    for (const selector of SEND_BUTTON_SELECTORS) {
      document.querySelectorAll(selector).forEach((button) => {
        if (!isVisible(button)) {
          return;
        }

        if (button.disabled || button.getAttribute('aria-disabled') === 'true') {
          return;
        }

        if (!buttons.includes(button)) {
          buttons.push(button);
        }
      });
    }

    return buttons;
  }

  function findBestSendButton(input) {
    const buttons = getSendButtons();
    if (!buttons.length) {
      return null;
    }

    const inputRect = input.getBoundingClientRect();

    let bestButton = null;
    let bestScore = Number.POSITIVE_INFINITY;

    buttons.forEach((button) => {
      const rect = button.getBoundingClientRect();
      const distance = Math.hypot(rect.left - inputRect.right, rect.top - inputRect.bottom);

      if (distance < bestScore) {
        bestScore = distance;
        bestButton = button;
      }
    });

    return bestButton;
  }

  function setReactInputValue(input, value) {
    if (input.isContentEditable) {
      input.focus();
      input.textContent = value;
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return;
    }

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

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function waitForComposer(timeoutMs = 10000) {
    const startAt = Date.now();

    while (Date.now() - startAt < timeoutMs) {
      const input = findBestInputElement();
      if (input) {
        return {
          input,
          sendButton: findBestSendButton(input)
        };
      }

      await delay(250);
    }

    throw new Error('chat_input_not_found');
  }

  async function insertAndSendOnCurrentPage(memoText) {
    if (!location.hostname.includes(NOTEBOOK_HOST)) {
      throw new Error('not_notebooklm_page');
    }

    const text = String(memoText || '').trim();
    if (!text) {
      throw new Error('empty_memo');
    }

    const composer = await waitForComposer();
    setReactInputValue(composer.input, text);

    if (composer.sendButton) {
      composer.sendButton.click();
      return { ok: true, method: 'button' };
    }

    composer.input.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        key: 'Enter',
        code: 'Enter'
      })
    );

    composer.input.dispatchEvent(
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
