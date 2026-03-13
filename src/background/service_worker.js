'use strict';

const NOTEBOOK_HOST = 'notebooklm.google.com';
const DEFAULT_NOTEBOOK_URL = `https://${NOTEBOOK_HOST}/`;
const GEMINI_HOST = 'gemini.google.com';
const DEFAULT_GEMINI_URL = `https://${GEMINI_HOST}/app`;
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
    'Instruction:',
    'この投稿は蓄積メモです。返信は不要です。',
    '',
    'Memo:',
    memo,
    '',
    'Tags:',
    tags.length ? tags.join(' ') : '(none)',
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

async function queryGeminiTabs() {
  return chrome.tabs.query({
    url: [`*://${GEMINI_HOST}/*`]
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

function extractNotebookId(url) {
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/notebook\/([^/]+)/);
    return match ? match[1] : null;
  } catch (_error) {
    return null;
  }
}

function isTargetNotebookTab(tabUrl, preferredUrl) {
  const preferredId = extractNotebookId(preferredUrl);
  if (preferredId) {
    return extractNotebookId(tabUrl) === preferredId;
  }

  return normalizeNotebookUrl(tabUrl) === normalizeNotebookUrl(preferredUrl);
}

async function getConfiguredNotebookUrl() {
  const result = await chrome.storage.local.get({ [SETTINGS_STORAGE_KEY]: {} });
  const settings = result[SETTINGS_STORAGE_KEY] || {};
  const notebooks = Array.isArray(settings.notebooks) ? settings.notebooks : [];

  const firstValid = notebooks.find((item) => item && typeof item.url === 'string' && item.url.trim());
  return firstValid ? firstValid.url.trim() : null;
}

function formatTabLabel(tab) {
  let pathHint = '';
  try {
    const parsed = new URL(tab.url || '');
    const segments = parsed.pathname.split('/').filter(Boolean);
    pathHint = segments.length ? segments[segments.length - 1] : parsed.hostname;
  } catch (_error) {
    pathHint = '';
  }

  return {
    id: tab.id,
    title: tab.title || '',
    url: tab.url || '',
    active: Boolean(tab.active),
    pathHint
  };
}

function selectNotebookTab(tabs, preferredUrl) {
  if (!tabs.length) {
    return null;
  }

  if (preferredUrl) {
    const exact = tabs.find((tab) => isTargetNotebookTab(tab.url, preferredUrl));
    if (exact) {
      return exact;
    }

    // When a notebook is explicitly configured, do not fall back to another notebook tab.
    return null;
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

function isGeminiUrl(url) {
  try {
    return new URL(url).hostname.includes(GEMINI_HOST);
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

function sanitizeGeminiUrl(url) {
  if (!url || !isGeminiUrl(url)) {
    return null;
  }
  return url;
}

async function waitForTabReady(tabId, matcher, timeoutMs = 15000) {
  const startAt = Date.now();

  while (Date.now() - startAt < timeoutMs) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (matcher(tab.url) && tab.status === 'complete') {
        return true;
      }
    } catch (_error) {
      // Tab can be temporarily unavailable during navigation.
    }
    await delay(300);
  }

  return false;
}

async function waitForNotebookTabReady(tabId, timeoutMs = 15000) {
  return waitForTabReady(tabId, isNotebookUrl, timeoutMs);
}

async function waitForGeminiTabReady(tabId, timeoutMs = 15000) {
  return waitForTabReady(tabId, isGeminiUrl, timeoutMs);
}

async function executeSenderScript(tabId, file, objectName, memoText) {
  if (!chrome.scripting?.executeScript) {
    return { ok: false, reason: 'scripting_unavailable' };
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [file]
  });

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    args: [memoText, objectName],
    func: async (text, senderName) => {
      const sender = window[senderName];
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

async function sendToNotebookTab(tabId, memoText) {
  return executeSenderScript(
    tabId,
    'src/content/notebook_sender.js',
    'NotebookLMCaptureSender',
    memoText
  );
}

async function sendToGeminiTab(tabId, memoText) {
  return executeSenderScript(
    tabId,
    'src/content/gemini_sender.js',
    'NotebookLMCaptureGeminiSender',
    memoText
  );
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

async function recoverGeminiTab(tabId, targetUrl) {
  const snapshot = await getTabSnapshot(tabId);
  if (!isGeminiUrl(snapshot.url)) {
    await chrome.tabs.update(tabId, {
      url: sanitizeGeminiUrl(targetUrl) || DEFAULT_GEMINI_URL,
      active: false
    });
  }
  await waitForGeminiTabReady(tabId, 25000);
}

function selectGeminiTab(tabs) {
  if (!tabs.length) {
    return null;
  }

  const active = tabs.find((tab) => tab.active);
  return active || tabs[0];
}

async function ensureGeminiTab(options = {}) {
  const preferredTabId = Number.isInteger(options.preferredTabId) ? options.preferredTabId : null;
  const tabs = await queryGeminiTabs();

  if (preferredTabId !== null) {
    const preferredTab = tabs.find((tab) => tab.id === preferredTabId);
    if (preferredTab) {
      return {
        tab: preferredTab,
        opened: false,
        targetUrl: preferredTab.url || DEFAULT_GEMINI_URL
      };
    }
  }

  const existing = selectGeminiTab(tabs);
  if (existing) {
    if (!isGeminiUrl(existing.url) && existing.id) {
      const updated = await chrome.tabs.update(existing.id, {
        url: DEFAULT_GEMINI_URL,
        active: false
      });
      return { tab: updated, opened: false, targetUrl: DEFAULT_GEMINI_URL };
    }
    return { tab: existing, opened: false, targetUrl: existing.url || DEFAULT_GEMINI_URL };
  }

  const created = await chrome.tabs.create({
    url: DEFAULT_GEMINI_URL,
    active: false
  });
  return { tab: created, opened: true, targetUrl: DEFAULT_GEMINI_URL };
}

async function activateTab(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (typeof tab.windowId === 'number') {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
  return chrome.tabs.update(tabId, { active: true });
}

async function restoreSourceTab(sourceTabId) {
  if (!sourceTabId) {
    return;
  }

  try {
    await activateTab(sourceTabId);
  } catch (_error) {
    // Source tab may be gone; no restore needed.
  }
}

async function sendWithRetry(tabId, memoText, openedNow, targetUrl, options) {
  const maxAttempts = openedNow ? 8 : 4;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await options.send(tabId, memoText);
      if (response?.ok) {
        return response;
      }
      lastError = new Error(response?.reason || 'send_failed');
    } catch (error) {
      lastError = await withTabContextError(error, tabId);

      if (isTabAccessError(error)) {
        await options.waitUntilReady(tabId);
      }

      if (isHostPermissionError(error)) {
        await options.recover(tabId, targetUrl);
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

  if (message.type === 'NOTEBOOKLM_CAPTURE_LIST_GEMINI_TABS') {
    queryGeminiTabs()
      .then((tabs) => {
        sendResponse({
          ok: true,
          tabs: tabs.map(formatTabLabel)
        });
      })
      .catch(() => {
        sendResponse({
          ok: false,
          tabs: []
        });
      });
    return true;
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
  const target = payload.target === 'gemini' ? 'gemini' : 'notebooklm';
  const memoText = target === 'gemini'
    ? memo
    : buildMessage(payload, context);
  const route = target === 'gemini'
    ? {
        ensureTab: ensureGeminiTab,
        waitUntilReady: waitForGeminiTabReady,
        send: sendToGeminiTab,
        recover: recoverGeminiTab
      }
    : {
        ensureTab: ensureNotebookTab,
        waitUntilReady: waitForNotebookTabReady,
        send: sendToNotebookTab,
        recover: recoverNotebookTab
      };

  const ensureOptions = target === 'gemini'
    ? { preferredTabId: Number.isInteger(payload.geminiTabId) ? payload.geminiTabId : null }
    : payload.notebookUrl;

  route.ensureTab(ensureOptions)
    .then(async ({ tab, opened, targetUrl }) => {
      if (!tab?.id) {
        throw new Error(`${target}_tab_unavailable`);
      }

      const sourceTabId = sender.tab?.id ?? null;
      const shouldActivateTarget = target === 'gemini' && sourceTabId !== null && sourceTabId !== tab.id;

      let result;
      try {
        if (shouldActivateTarget) {
          await activateTab(tab.id);
          await delay(500);
        }

        await route.waitUntilReady(tab.id, opened ? 25000 : 10000);
        result = await sendWithRetry(tab.id, memoText, opened, targetUrl, route);
      } finally {
        if (shouldActivateTarget) {
          await delay(300);
          await restoreSourceTab(sourceTabId);
        }
      }

      await addCaptureLog({
        target,
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
        tabId: tab.id,
        targetUrl,
        target
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
