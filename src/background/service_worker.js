'use strict';

chrome.runtime.onInstalled.addListener(() => {
  console.log('NotebookLM Capture installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'NOTEBOOKLM_CAPTURE_PING') {
    return false;
  }

  sendResponse({ ok: true, from: 'service_worker', senderTabId: sender.tab?.id ?? null });
  return true;
});
