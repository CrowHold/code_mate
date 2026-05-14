// Code_Mate background service worker — v0.2.
// Responsibilities:
//   1. Seed curated glossary on install/update
//   2. Register "Define with Code_Mate" context menu
//   3. Relay context-menu clicks to the active tab's content script
//   4. Open doc URLs in a popup window
//   5. Open the settings page (action click or in-bubble link)
//   6. Generate AI definitions on demand (Anthropic BYOK), with local cache

const CONTEXT_MENU_ID = 'codemate-define';
const GLOSSARY_KEY = 'glossary';
const AI_CACHE_KEY = 'glossary_ai_cache';
const SETTINGS_KEY = 'settings';

// Bump when glossary.json schema changes — forces a re-seed of stale storage.
const EXPECTED_SCHEMA = 'v2-eli-tiered';

// Models: Haiku for the speed/cost tiers, Sonnet optional for ELI25 depth
const MODEL_DEFAULT = 'claude-haiku-4-5-20251001';
const MODEL_DEEP    = 'claude-sonnet-4-6';

// ── Normalisation helpers (mirror bubble.js) ────────────────────────────────

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

// ── Glossary seeding ────────────────────────────────────────────────────────

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
    schema: payload?.schema || 'v1',
    entries, byTerm, byCanon, byAlias,
  };
}

async function seedGlossary() {
  try {
    const url = chrome.runtime.getURL('data/glossary.json');
    const res = await fetch(url);
    if (!res.ok) throw new Error(`glossary fetch ${res.status}`);
    const payload = await res.json();
    const index = indexGlossary(payload);
    await chrome.storage.local.set({ [GLOSSARY_KEY]: index });
    console.log(`[Code_Mate] glossary seeded: ${index.entries.length} entries, schema ${index.schema}`);
    return true;
  } catch (err) {
    console.error('[Code_Mate] glossary seed failed:', err);
    return false;
  }
}

// Idempotent: seeds the glossary only if it is missing, empty, or on a stale schema.
// Called at top-level on every worker start AND before every define relay, so the
// glossary self-heals even if a previous onInstalled seed was cut short by the
// MV3 service-worker lifecycle.
async function ensureGlossarySeeded() {
  try {
    const existing = (await chrome.storage.local.get(GLOSSARY_KEY))[GLOSSARY_KEY];
    const healthy =
      existing &&
      Array.isArray(existing.entries) &&
      existing.entries.length > 0 &&
      existing.byTerm &&
      existing.schema === EXPECTED_SCHEMA;
    if (healthy) return true;
    console.log('[Code_Mate] glossary missing or stale — seeding now.');
    return await seedGlossary();
  } catch (err) {
    console.error('[Code_Mate] ensureGlossarySeeded failed:', err);
    return false;
  }
}

// Idempotent context-menu registration. Safe to call on every worker start.
function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: CONTEXT_MENU_ID,
      title: 'Define with Code_Mate',
      contexts: ['selection'],
    });
  });
}

// ── URL safety ──────────────────────────────────────────────────────────────

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

// ── Lifecycle ───────────────────────────────────────────────────────────────

// Runs at the TOP LEVEL on every service-worker start (install, browser startup,
// and on-demand wake). This is the reliable seed path — onInstalled alone is not,
// because MV3 can tear the worker down before an async onInstalled handler finishes.
(async function init() {
  ensureContextMenu();
  await ensureGlossarySeeded();
})();

// On install/update, force a fresh re-seed (picks up a new bundled glossary.json).
chrome.runtime.onInstalled.addListener(async () => {
  ensureContextMenu();
  await seedGlossary();
});

chrome.runtime.onStartup.addListener(async () => {
  ensureContextMenu();
  await ensureGlossarySeeded();
});

// Toolbar icon click → open settings.
// Tries a popout window first; if chrome.windows.create fails for any reason
// (the failure the operator hit on 2026-05-12), falls back to a normal tab so
// the settings page ALWAYS opens by at least one path.
function openSettingsPopout() {
  const settingsUrl = chrome.runtime.getURL('settings.html');
  console.log('[Code_Mate] openSettingsPopout →', settingsUrl);

  const fallbackToTab = (why) => {
    console.warn('[Code_Mate] popout failed, opening settings as a tab. Reason:', why);
    try {
      chrome.tabs.create({ url: settingsUrl });
    } catch (tabErr) {
      console.error('[Code_Mate] tab fallback also failed:', tabErr);
    }
  };

  try {
    chrome.windows.create(
      { url: settingsUrl, type: 'popup', width: 640, height: 760 },
      (win) => {
        if (chrome.runtime.lastError || !win) {
          fallbackToTab(chrome.runtime.lastError?.message || 'no window returned');
        } else {
          console.log('[Code_Mate] settings popout opened, window id', win.id);
        }
      }
    );
  } catch (err) {
    fallbackToTab(err?.message || String(err));
  }
}

chrome.action.onClicked.addListener((tab) => {
  console.log('[Code_Mate] toolbar icon clicked');
  openSettingsPopout();
});

// Self-healing message send. If the content script isn't there (common after extension
// reload — tabs opened before the reload don't get the new content script automatically),
// inject it programmatically and retry once.
async function sendDefineMessage(tabId, payload) {
  try {
    await chrome.tabs.sendMessage(tabId, payload);
    return true;
  } catch (err) {
    const m = err?.message || '';
    const needsInjection =
      m.includes('Receiving end does not exist') ||
      m.includes('Could not establish connection') ||
      m.includes('Extension context invalidated');
    if (!needsInjection) {
      console.warn('[Code_Mate] tabs.sendMessage failed:', m);
      return false;
    }
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      // Give the listener a tick to register
      await new Promise((r) => setTimeout(r, 50));
      await chrome.tabs.sendMessage(tabId, payload);
      return true;
    } catch (injectErr) {
      console.warn('[Code_Mate] content script injection failed:', injectErr?.message);
      return false;
    }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== CONTEXT_MENU_ID) return;
  if (!tab?.id) return;
  if (isBrowserInternalUrl(tab.url)) return;
  // Guarantee the glossary is present before the bubble tries to look anything up.
  await ensureGlossarySeeded();
  await sendDefineMessage(tab.id, {
    type: 'cm-define',
    selectionText: info.selectionText || '',
  });
});

// ── Message router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== 'object') return false;

  if (msg.type === 'cm-open-docs') {
    const targetUrl = typeof msg.url === 'string' ? msg.url : '';
    if (!targetUrl) { sendResponse({ ok: false, error: 'no url' }); return true; }
    const shellUrl = chrome.runtime.getURL(`popout/docs.html?url=${encodeURIComponent(targetUrl)}`);
    chrome.windows.create(
      { url: shellUrl, type: 'popup', width: 480, height: 720 },
      () => sendResponse({ ok: true })
    );
    return true;
  }

  if (msg.type === 'cm-open-settings') {
    console.log('[Code_Mate] cm-open-settings message received');
    openSettingsPopout();
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'cm-generate') {
    handleGenerate(msg.term)
      .then((entry) => sendResponse({ ok: true, entry }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
    return true;
  }

  return false;
});

// ── AI generation (Anthropic Messages API) ──────────────────────────────────

const GENERATION_SYSTEM_PROMPT = `You are Code_Mate, a coding glossary that produces concise, accurate definitions for technical terms. The user is a working developer reading code on the web.

You must respond with valid JSON only (no prose before or after, no code fences) matching this schema:
{
  "term": "the canonical form of the term",
  "category": "keyword" | "function" | "config" | "concept" | "command",
  "technical": "ONE short technical sentence under 20 words",
  "eli14": "Deep coding scaffolding (~60-100 words). Code shown alongside concept where useful. One abstraction layer at a time. Beginner-friendly but technically correct.",
  "eli19": "General technical (~50-90 words). Technical terms used with brief inline definition. 1-2 abstraction layers. Default tier for most developers.",
  "eli25": "Peer-level shorthand (~30-50 words). Technical shorthand acceptable. Focus on the specific decision or behaviour. No foundation explained.",
  "codeExample": "A short, runnable code snippet (max 8 lines) demonstrating the term. Omit only if the term is genuinely uncodable (e.g. a pure concept).",
  "docLinks": [
    { "title": "...", "url": "https://...", "source": "domain.com" }
  ]
}

Rules:
- docLinks: 1-2 authoritative sources only (official docs, RFCs, canonical papers). Never blogs unless that blog is the canonical source. Never your own training opinions.
- If the term is ambiguous, pick the most common meaning in software development context.
- If the term is not a coding/technical term, set technical to "Not a coding term." and leave eli tiers empty.
- Australian English spelling (organise, behaviour, colour) where the choice arises.
- No emoji.`;

async function callAnthropic(model, term) {
  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  const key = settings.anthropicKey;
  if (!key) throw new Error('No Anthropic API key. Open settings and add your key.');

  const body = {
    model,
    max_tokens: 1024,
    system: GENERATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Define this coding term: ${term}` }],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch (_e) {}
    throw new Error(`Anthropic API ${res.status}${detail ? ': ' + detail : ''}`);
  }

  const data = await res.json();
  const text = data?.content?.[0]?.text || '';
  return text;
}

function extractJson(text) {
  // Strip code fences if the model added them despite instructions
  let s = text.trim();
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
  }
  // Locate the outermost JSON object
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last < first) {
    throw new Error('Model did not return valid JSON.');
  }
  const slice = s.slice(first, last + 1);
  return JSON.parse(slice);
}

async function handleGenerate(rawTerm) {
  const term = String(rawTerm || '').trim();
  if (!term) throw new Error('Empty term.');

  const canon = canonicalKey(term);
  const cacheRes = await chrome.storage.local.get(AI_CACHE_KEY);
  const cache = cacheRes[AI_CACHE_KEY] || {};
  if (cache[canon]) return cache[canon];

  const settings = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY] || {};
  // Per-tier model choice: Haiku is fine for the generation pass (it produces all four tiers in one call).
  // The sonnetForEli25 toggle is reserved for a future "regenerate ELI25 with deeper model" feature.
  const model = MODEL_DEFAULT;
  const _useSonnetForDeep = !!settings.sonnetForEli25; // reserved for v0.3
  void _useSonnetForDeep;
  void MODEL_DEEP;

  const raw = await callAnthropic(model, term);
  let parsed;
  try {
    parsed = extractJson(raw);
  } catch (err) {
    throw new Error(`Could not parse AI response: ${err.message}`);
  }

  // Defensive normalisation — ensure all fields are present so the bubble renders cleanly
  const entry = {
    term: parsed.term || term,
    aliases: [],
    category: parsed.category || 'concept',
    technical: parsed.technical || '',
    eli14: parsed.eli14 || parsed.technical || '',
    eli19: parsed.eli19 || parsed.technical || '',
    eli25: parsed.eli25 || parsed.technical || '',
    codeExample: parsed.codeExample || '',
    docLinks: Array.isArray(parsed.docLinks) ? parsed.docLinks.slice(0, 3) : [],
    _generated: { model, at: Date.now() },
  };

  cache[canon] = entry;
  await chrome.storage.local.set({ [AI_CACHE_KEY]: cache });
  return entry;
}
