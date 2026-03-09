'use strict';

const NOTEBOOK_HOST = 'notebooklm.google.com';
const DEFAULT_NOTEBOOK_URL = `https://${NOTEBOOK_HOST}/`;
const LOG_STORAGE_KEY = 'captureLogs';
const MAX_LOGS = 500;

chrome.runtime.onInstalled.addListener(() => {
  console.log('NotebookLM Capture installed');
});

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }
  return tags.map((tag) => String(tag).trim()).filter(Boolean);
}

function buildMessage(payload, context) {
  const memo = String(payload?.memo || '').trim();
  const tags = normalizeTags(payload?.tags);

  const lines = [
    '[Capture]',
    '',
    'Memo:',
    memo,
    '',
    'Tags:',
    tags.length ? tags.join(' ') : '-',
    '',
    'Source:',
    context?.title || '(untitled)',
    '',
    'URL:',
    context?.url || '',
    '',
    'Time:',
    context?.timestamp || new Date().toISOString()
  ];

  if (context?.slack) {
    lines.push(
      '',
      'Slack Workspace:',
      context.slack.workspace || '',
      '',
      'Slack Channel:',
      context.slack.channel || '',
      '',
      'Slack Message:',
      context.slack.messagePermalink || ''
    );
  }

  return lines.join('\n');
}

async function queryNotebookTabs() {
  return chrome.tabs.query({
    url: [`*://${NOTEBOOK_HOST}/*`]
  });
}

function selectNotebookTab(tabs, preferredUrl) {
  if (!tabs.length) {
    return null;
  }

  if (preferredUrl) {
    const exact = tabs.find((tab) => tab.url === preferredUrl);
    if (exact) {
      return exact;
    }
  }

  const active = tabs.find((tab) => tab.active);
  return active || tabs[0];
}

async function ensureNotebookTab(preferredUrl) {
  const tabs = await queryNotebookTabs();
  const existing = selectNotebookTab(tabs, preferredUrl);
  if (existing) {
    return { tab: existing, opened: false };
  }

  const created = await chrome.tabs.create({
    url: preferredUrl || DEFAULT_NOTEBOOK_URL,
    active: true
  });
  return { tab: created, opened: true };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToNotebookTab(tabId, memoText) {
  return chrome.tabs.sendMessage(tabId, {
    type: 'NOTEBOOKLM_CAPTURE_INSERT_AND_SEND',
    payload: { memoText }
  });
}

function isMissingReceiverError(error) {
  const message = String(error?.message || '');
  return (
    message.includes('Receiving end does not exist') ||
    message.includes('Could not establish connection')
  );
}

async function ensureNotebookReceiver(tabId) {
  if (!chrome.scripting?.executeScript) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content/notebook_sender.js']
  });
}

async function sendWithRetry(tabId, memoText, openedNow) {
  const maxAttempts = openedNow ? 6 : 3;
  let lastError = null;
  let attemptedInjection = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await sendToNotebookTab(tabId, memoText);
      if (response?.ok) {
        return response;
      }
      lastError = new Error(response?.reason || 'send_failed');
    } catch (error) {
      lastError = error;

      if (isMissingReceiverError(error) && !attemptedInjection) {
        attemptedInjection = true;
        await ensureNotebookReceiver(tabId);
      }
    }
    await delay(400 * attempt);
  }

  throw lastError || new Error('send_failed');
}

async function addCaptureLog(entry) {
  const result = await chrome.storage.local.get({ [LOG_STORAGE_KEY]: [] });
  const logs = Array.isArray(result[LOG_STORAGE_KEY]) ? result[LOG_STORAGE_KEY] : [];
  const next = [entry, ...logs].slice(0, MAX_LOGS);
  await chrome.storage.local.set({ [LOG_STORAGE_KEY]: next });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type === 'NOTEBOOKLM_CAPTURE_PING') {
    sendResponse({ ok: true, from: 'service_worker', senderTabId: sender.tab?.id ?? null });
    return true;
  }

  if (message.type !== 'NOTEBOOKLM_CAPTURE_SEND_REQUEST') {
    return false;
  }

  const payload = message.payload || {};
  const memo = String(payload.memo || '').trim();
  if (!memo) {
    sendResponse({ ok: false, reason: 'empty_memo' });
    return true;
  }

  const context = payload.context || {};
  const memoText = buildMessage(payload, context);

  ensureNotebookTab(payload.notebookUrl)
    .then(async ({ tab, opened }) => {
      if (!tab?.id) {
        throw new Error('notebook_tab_unavailable');
      }

      const result = await sendWithRetry(tab.id, memoText, opened);
      await addCaptureLog({
        memo,
        tags: normalizeTags(payload.tags),
        timestamp: context.timestamp || new Date().toISOString(),
        sourcePage: {
          title: context.title || sender.tab?.title || '',
          url: context.url || sender.tab?.url || '',
          hostname: context.hostname || ''
        }
      });

      sendResponse({
        ok: true,
        result,
        tabId: tab.id
      });
    })
    .catch((error) => {
      sendResponse({
        ok: false,
        reason: error?.message || 'send_failed'
      });
    });

  return true;
});
