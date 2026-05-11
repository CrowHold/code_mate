// Code_Mate background service worker.
// Responsibilities:
//   1. On install/update: load data/glossary.json, pre-index, write to chrome.storage.local
//   2. Register the "Define with Code_Mate" context menu on text selection
//   3. On context menu click: relay selection to active tab's content script
//   4. On cm-open-docs message: open the doc URL in a popup window

const CONTEXT_MENU_ID = 'codemate-define';
const STORAGE_KEY = 'glossary';

function normaliseTerm(raw) {
  return String(raw || '')
    .toLowerCase()
    .trim()
    .replace(/^[\s"'`(\[{<>,.;:!?]+|[\s"'`)\]}<>,.;:!?]+$/g, '')
    .replace(/\s+/g, ' ');
}

function canonicalKey(raw) {
  return normaliseTerm(raw).replace(/[-_\s]+/g, '-');
}

function indexGlossary(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const byTerm = {};
  const byCanon = {};
  const byAlias = {};
  for (const entry of entries) {
    if (!entry?.term) continue;
    const termKey = entry.term.toLowerCase();
    byTerm[termKey] = entry;
    byCanon[canonicalKey(entry.term)] = entry;
    for (const alias of entry.aliases || []) {
      byAlias[canonicalKey(alias)] = termKey;
    }
  }
  return {
    version: payload?.version || '0.0.0',
    updated: payload?.updated || null,
    entries,
    byTerm,
    byCanon,
    byAlias,
  };
}

async function seedGlossary() {
  try {
    const url = chrome.runtime.getURL('data/glossary.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`glossary fetch ${res.status}`);
    const payload = await res.json();
    const index = indexGlossary(payload);
    await chrome.storage.local.set({ [STORAGE_KEY]: index });
  } catch (err) {
    console.error('[Code_Mate] glossary seed failed:', err);
  }
}

function isBrowserInternalUrl(url) {
  if (!url) return true;
  return (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('brave://') ||
    url.startsWith('chrome-search://')
  );
}

chrome.runtime.onInstalled.addListener(async () => {
  await seedGlossary();
  // Idempotent context menu setup
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Define with Code_Mate',
      contexts: ['selection'],
    });
  });
});

// Re-seed on browser restart (service worker spin-up). Cheap and safe.
chrome.runtime.onStartup.addListener(seedGlossary);

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  if (!tab?.id) return;
  if (isBrowserInternalUrl(tab.url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'cm-define',
      selectionText: info.selectionText || '',
    });
  } catch (err) {
    // Content script not loaded (e.g. on an extension gallery page or a tab opened before install).
    // No-op; user can refresh the page and try again.
    console.warn('[Code_Mate] tabs.sendMessage failed:', err?.message);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== 'cm-open-docs') return false;
  const targetUrl = typeof msg.url === 'string' ? msg.url : '';
  if (!targetUrl) {
    sendResponse({ ok: false, error: 'no url' });
    return true;
  }
  const shellUrl = chrome.runtime.getURL(
    `popout/docs.html?url=${encodeURIComponent(targetUrl)}`
  );
  chrome.windows.create(
    {
      url: shellUrl,
      type: 'popup',
      width: 480,
      height: 720,
    },
    () => sendResponse({ ok: true })
  );
  return true; // keep the message channel open for async sendResponse
});
