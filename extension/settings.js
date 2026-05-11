// Code_Mate settings page.
// Loads/saves anthropicKey + sonnetForEli25 toggle to chrome.storage.local under 'settings'.

const SETTINGS_KEY = 'settings';
const GLOSSARY_KEY = 'glossary';
const AI_CACHE_KEY = 'glossary_ai_cache';

const keyInput = document.getElementById('anthropic-key');
const sonnetToggle = document.getElementById('sonnet-eli25');
const saveBtn = document.getElementById('save-btn');
const clearBtn = document.getElementById('clear-btn');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const statusMsg = document.getElementById('status-msg');
const cacheMsg = document.getElementById('cache-msg');
const statusPill = document.getElementById('status-pill');
const versionEl = document.getElementById('version');
const entryCountEl = document.getElementById('entry-count');

function flashStatus(el, message, level = '') {
  el.textContent = message;
  el.className = 'status' + (level ? ' ' + level : '');
  setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 2400);
}

function setPill(hasKey) {
  statusPill.textContent = hasKey ? 'Active' : 'No key';
  statusPill.style.background = hasKey ? 'rgba(74, 222, 128, 0.16)' : 'rgba(196, 135, 58, 0.18)';
  statusPill.style.color = hasKey ? '#4ade80' : '';
}

async function load() {
  const r = await chrome.storage.local.get([SETTINGS_KEY, GLOSSARY_KEY]);
  const settings = r[SETTINGS_KEY] || {};
  if (settings.anthropicKey) {
    keyInput.value = settings.anthropicKey;
    setPill(true);
  } else {
    setPill(false);
  }
  sonnetToggle.checked = !!settings.sonnetForEli25;

  const glossary = r[GLOSSARY_KEY];
  if (glossary?.entries) entryCountEl.textContent = glossary.entries.length;
  if (glossary?.version) versionEl.textContent = glossary.version;
}

saveBtn.addEventListener('click', async () => {
  const key = keyInput.value.trim();
  if (key && !/^sk-ant-/.test(key)) {
    flashStatus(statusMsg, 'Anthropic keys usually start with sk-ant-. Save anyway?', 'error');
    // Don't block — let user save if they know what they're doing
  }
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  const next = { ...(r[SETTINGS_KEY] || {}), anthropicKey: key, sonnetForEli25: sonnetToggle.checked };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  setPill(!!key);
  flashStatus(statusMsg, 'Saved.', 'success');
});

clearBtn.addEventListener('click', async () => {
  const r = await chrome.storage.local.get(SETTINGS_KEY);
  const next = { ...(r[SETTINGS_KEY] || {}) };
  delete next.anthropicKey;
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  keyInput.value = '';
  setPill(false);
  flashStatus(statusMsg, 'Key cleared.', 'success');
});

clearCacheBtn.addEventListener('click', async () => {
  await chrome.storage.local.set({ [AI_CACHE_KEY]: {} });
  flashStatus(cacheMsg, 'AI cache cleared.', 'success');
});

load();
