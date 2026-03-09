'use strict';

const NOTEBOOK_HOST = 'notebooklm.google.com';
const DEFAULT_NOTEBOOK_URL = `https://${NOTEBOOK_HOST}/`;
const LOG_STORAGE_KEY = 'captureLogs';
const SETTINGS_STORAGE_KEY = 'settings';
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

function normalizeNotebookUrl(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.replace(/\/$/, '');
  } catch (_error) {
    return null;
  }
}

async function getConfiguredNotebookUrl() {
  const result = await chrome.storage.local.get({ [SETTINGS_STORAGE_KEY]: {} });
  const settings = result[SETTINGS_STORAGE_KEY] || {};
  const notebooks = Array.isArray(settings.notebooks) ? settings.notebooks : [];

  const firstValid = notebooks.find((item) => item && typeof item.url === 'string' && item.url.trim());
  return firstValid ? firstValid.url.trim() : null;
}

function selectNotebookTab(tabs, preferredUrl) {
  if (!tabs.length) {
    return null;
  }

  if (preferredUrl) {
    const preferred = normalizeNotebookUrl(preferredUrl);
    const exact = tabs.find((tab) => normalizeNotebookUrl(tab.url) === preferred);
    if (exact) {
      return exact;
    }
  }

  const active = tabs.find((tab) => tab.active);
  return active || tabs[0];
}

async function ensureNotebookTab(preferredUrl) {
  const configuredUrl = sanitizeNotebookUrl(preferredUrl) || sanitizeNotebookUrl(await getConfiguredNotebookUrl());
  const fallbackUrl = configuredUrl || DEFAULT_NOTEBOOK_URL;
  const tabs = await queryNotebookTabs();
  const existing = selectNotebookTab(tabs, configuredUrl);
  if (existing) {
    if (!isNotebookUrl(existing.url) && existing.id) {
      const updated = await chrome.tabs.update(existing.id, {
        url: fallbackUrl,
        active: false
      });
      return { tab: updated, opened: false, targetUrl: fallbackUrl };
    }
    return { tab: existing, opened: false, targetUrl: fallbackUrl };
  }

  const created = await chrome.tabs.create({
    url: fallbackUrl,
    active: false
  });
  return { tab: created, opened: true, targetUrl: fallbackUrl };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNotebookUrl(url) {
  try {
    return new URL(url).hostname.includes(NOTEBOOK_HOST);
  } catch (_error) {
    return false;
  }
}

function sanitizeNotebookUrl(url) {
  if (!url || !isNotebookUrl(url)) {
    return null;
  }
  return url;
}

async function waitForNotebookTabReady(tabId, timeoutMs = 15000) {
  const startAt = Date.now();

  while (Date.now() - startAt < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (isNotebookUrl(tab.url) && tab.status === 'complete') {
        return true;
      }
    } catch (_error) {
      // Tab can be temporarily unavailable during navigation.
    }
    await delay(300);
  }

  return false;
}

async function sendToNotebookTab(tabId, memoText) {
  if (!chrome.scripting?.executeScript) {
    return chrome.tabs.sendMessage(tabId, {
      type: 'NOTEBOOKLM_CAPTURE_INSERT_AND_SEND',
      payload: { memoText }
    });
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['src/content/notebook_sender.js']
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [memoText],
    func: async (text) => {
      const sender = window.NotebookLMCaptureSender;
      if (!sender || typeof sender.insertAndSendOnCurrentPage !== 'function') {
        return { ok: false, reason: 'sender_api_unavailable' };
      }

      try {
        return await sender.insertAndSendOnCurrentPage(text);
      } catch (error) {
        return { ok: false, reason: error?.message || 'send_failed' };
      }
    }
  });

  return results?.[0]?.result || { ok: false, reason: 'send_result_missing' };
}

function isTabAccessError(error) {
  const message = String(error?.message || '');
  return message.includes('Cannot access contents of the page');
}

function isHostPermissionError(error) {
  const message = String(error?.message || '');
  return message.includes('Extension manifest must request permission to access the respective host');
}

async function getTabSnapshot(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    return {
      url: tab.url || '',
      status: tab.status || 'unknown'
    };
  } catch (_error) {
    return {
      url: '',
      status: 'unavailable'
    };
  }
}

async function withTabContextError(error, tabId) {
  const snapshot = await getTabSnapshot(tabId);
  const base = String(error?.message || 'send_failed');
  return new Error(`${base} [tabUrl=${snapshot.url || 'unknown'} tabStatus=${snapshot.status}]`);
}

async function recoverNotebookTab(tabId, targetUrl) {
  const snapshot = await getTabSnapshot(tabId);
  if (!isNotebookUrl(snapshot.url)) {
    await chrome.tabs.update(tabId, {
      url: sanitizeNotebookUrl(targetUrl) || DEFAULT_NOTEBOOK_URL,
      active: false
    });
  }
  await waitForNotebookTabReady(tabId, 25000);
}

async function sendWithRetry(tabId, memoText, openedNow, targetUrl) {
  const maxAttempts = openedNow ? 8 : 4;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await sendToNotebookTab(tabId, memoText);
      if (response?.ok) {
        return response;
      }
      lastError = new Error(response?.reason || 'send_failed');
    } catch (error) {
      lastError = await withTabContextError(error, tabId);

      if (isTabAccessError(error)) {
        await waitForNotebookTabReady(tabId);
      }

      if (isHostPermissionError(error)) {
        await recoverNotebookTab(tabId, targetUrl);
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
    .then(async ({ tab, opened, targetUrl }) => {
      if (!tab?.id) {
        throw new Error('notebook_tab_unavailable');
      }

      await waitForNotebookTabReady(tab.id, opened ? 25000 : 10000);
      const result = await sendWithRetry(tab.id, memoText, opened, targetUrl);
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
