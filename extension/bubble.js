// Code_Mate bubble module — v0.2.
// Owns the persistent Shadow DOM host, glossary lookup, positioning, animations, dismissal,
// ELI tier toggling, and AI-fallback flow for not-found terms.

const HOST_ID = '__codemate_host__';
const STORAGE_GLOSSARY = 'glossary';
const STORAGE_AI_CACHE = 'glossary_ai_cache';
const STORAGE_SETTINGS = 'settings';

const BUBBLE_W = 380;
const BUBBLE_H_EST = 320;
const GAP = 12;
const VIEWPORT_MARGIN = 16;

const TIERS = ['technical', 'eli14', 'eli19', 'eli25'];
const TIER_LABELS = { technical: 'Tech', eli14: 'ELI14', eli19: 'ELI19', eli25: 'ELI25' };
const DEFAULT_TIER = 'eli25';

let cachedGlossary = null;
let cachedCss = null;
let cachedAiCache = null;
let shadowRootRef = null;
let activeCleanup = null;
let activeBubbleEl = null;
let activeState = null; // { entry, queryTerm, source: 'curated' | 'ai' | 'unknown', tier }

// ── Normalisation & lookup ───────────────────────────────────────────────────

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

function lookup(glossary, raw) {
  if (!glossary) return null;
  const norm = normaliseTerm(raw);
  if (glossary.byTerm?.[norm]) return glossary.byTerm[norm];
  const canon = canonicalKey(raw);
  if (glossary.byCanon?.[canon]) return glossary.byCanon[canon];
  if (glossary.byAlias?.[canon]) {
    const targetKey = glossary.byAlias[canon];
    if (glossary.byTerm?.[targetKey]) return glossary.byTerm[targetKey];
  }
  return null;
}

// ── Storage loaders ──────────────────────────────────────────────────────────

// Builds the lookup index from a raw glossary.json payload. Mirror of background.js
// indexGlossary — used by the direct-fetch fallback below.
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
    schema: payload?.schema || 'v1',
    entries, byTerm, byCanon, byAlias,
  };
}

function isHealthyGlossary(g) {
  return !!(g && Array.isArray(g.entries) && g.entries.length > 0 && g.byTerm);
}

async function loadGlossary() {
  if (cachedGlossary && isHealthyGlossary(cachedGlossary)) return cachedGlossary;

  let result = null;
  try {
    result = await chrome.storage.local.get(STORAGE_GLOSSARY);
  } catch (err) {
    // Thrown when the extension context is invalidated (page open across an
    // extension reload). Fall through to the direct-fetch fallback below.
    console.warn('[Code_Mate] storage.get(glossary) failed:', err?.message);
  }
  cachedGlossary = result?.[STORAGE_GLOSSARY] || null;

  // Fallback: if storage is empty or malformed (background seed never ran, was cut
  // short by the MV3 worker lifecycle, or failed), fetch and index the bundled
  // glossary.json directly. data/glossary.json is in web_accessible_resources, so
  // a content-script context can always fetch it. This guarantees curated terms
  // resolve regardless of the background worker's state.
  if (!isHealthyGlossary(cachedGlossary)) {
    try {
      const res = await fetch(chrome.runtime.getURL('data/glossary.json'));
      if (res.ok) {
        const payload = await res.json();
        cachedGlossary = indexGlossary(payload);
        console.log(`[Code_Mate] glossary loaded via direct-fetch fallback: ${cachedGlossary.entries.length} entries`);
      } else {
        console.error('[Code_Mate] glossary direct-fetch fallback: HTTP', res.status);
      }
    } catch (err) {
      console.error('[Code_Mate] glossary direct-fetch fallback failed:', err);
    }
  }

  if (chrome.storage?.onChanged && !loadGlossary._listening) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_GLOSSARY]) {
        const next = changes[STORAGE_GLOSSARY].newValue || null;
        // Only adopt the storage value if it is healthy — never downgrade to null/empty.
        if (isHealthyGlossary(next)) cachedGlossary = next;
      }
      if (changes[STORAGE_AI_CACHE]) cachedAiCache = changes[STORAGE_AI_CACHE].newValue || null;
    });
    loadGlossary._listening = true;
  }
  return cachedGlossary;
}

async function loadAiCache() {
  if (cachedAiCache) return cachedAiCache;
  try {
    const result = await chrome.storage.local.get(STORAGE_AI_CACHE);
    cachedAiCache = result?.[STORAGE_AI_CACHE] || {};
  } catch (err) {
    console.warn('[Code_Mate] storage.get(ai_cache) failed:', err?.message);
    cachedAiCache = {};
  }
  return cachedAiCache;
}

async function loadCss() {
  if (cachedCss !== null) return cachedCss;
  try {
    const res = await fetch(chrome.runtime.getURL('bubble.css'));
    cachedCss = await res.text();
  } catch (err) {
    console.error('[Code_Mate] bubble.css fetch failed:', err);
    cachedCss = '';
  }
  return cachedCss;
}

async function loadSettings() {
  try {
    const r = await chrome.storage.local.get(STORAGE_SETTINGS);
    return r?.[STORAGE_SETTINGS] || {};
  } catch (err) {
    console.warn('[Code_Mate] storage.get(settings) failed:', err?.message);
    return {};
  }
}

// True while this content-script context is still connected to a live extension.
// After an extension reload/update, scripts injected by the previous version are
// "orphaned": the code keeps running but every chrome.* call throws
// "Extension context invalidated". chrome.runtime.id goes undefined in that state.
function isExtensionContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (_e) {
    return false;
  }
}

// Minimal, dependency-free notice shown when this content script is orphaned by an
// extension reload. Uses only plain DOM + inline styles — no chrome.* calls, no
// shadow-root CSS fetch — because in an invalidated context all of those throw.
function showStaleContextNotice(selectionRect) {
  try {
    const old = document.getElementById('__codemate_stale_notice__');
    if (old) old.remove();

    const note = document.createElement('div');
    note.id = '__codemate_stale_notice__';
    const top = selectionRect ? Math.max(8, selectionRect.bottom + 8) : 16;
    const left = selectionRect ? Math.max(8, selectionRect.left) : 16;
    note.style.cssText = [
      'position:fixed', `top:${top}px`, `left:${left}px`,
      'z-index:2147483647', 'max-width:300px', 'padding:12px 14px',
      'background:#1a1a1c', 'color:#e8e6e3', 'border:1px solid #c4873a',
      'border-radius:10px', 'box-shadow:0 8px 24px rgba(0,0,0,0.4)',
      'font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');
    note.textContent = 'Code_Mate was updated. Refresh this page to use it here.';

    (document.documentElement || document.body).appendChild(note);
    setTimeout(() => note.remove(), 6000);
    document.addEventListener('mousedown', () => note.remove(), { once: true, capture: true });
  } catch (_e) {
    // If even plain DOM is unavailable there is nothing more we can do.
  }
}

// ── Shadow DOM host & template ───────────────────────────────────────────────

// Injects <link rel="preconnect"> hints into document.head so the browser
// warms connections to Google Fonts CDN before the shadow-root CSS fires.
// Safe to call multiple times — guards against duplicate injection.
function injectFontPreconnects() {
  const origins = [
    'https://fonts.gstatic.com',
    'https://fonts.googleapis.com',
  ];
  origins.forEach((origin) => {
    if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

function ensureHost() {
  let host = document.getElementById(HOST_ID);

  // We already hold a live reference to this host's shadow root — reuse it.
  if (host && shadowRootRef) return shadowRootRef;

  // A host element exists but we have no shadow-root reference. This happens after
  // an extension reload: the previous session's host div is still in the page DOM,
  // already carrying a (closed, unreachable) shadow tree. Calling attachShadow on it
  // again throws NotSupportedError. Discard the stale host and start clean.
  if (host) {
    host.remove();
    host = null;
  }

  injectFontPreconnects();
  host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
  (document.documentElement || document.body).appendChild(host);

  shadowRootRef = host.attachShadow({ mode: 'closed' });
  return shadowRootRef;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Allow a small subset of inline markup inside ELI definitions (`code`, **bold**).
// We escape first, then re-introduce these via known patterns. Safe.
function renderInline(s) {
  let out = escapeHtml(s);
  out = out.replace(/`([^`\n]+?)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
  return out;
}

// ── Bubble construction ─────────────────────────────────────────────────────

function buildTierToggleHtml(activeTier, availableTiers) {
  return `<div class="cm-tiers" data-cm-tiers>${TIERS.map((t) => {
    const present = availableTiers.includes(t);
    const active = t === activeTier;
    const disabled = present ? '' : 'disabled';
    const cls = active ? 'cm-tier-btn cm-tier-active' : 'cm-tier-btn';
    return `<button class="${cls}" data-cm-tier="${t}" ${disabled} title="${TIER_LABELS[t]}">${TIER_LABELS[t]}</button>`;
  }).join('')}</div>`;
}

function buildDocLinksHtml(docLinks) {
  if (!docLinks || !docLinks.length) return '';
  const items = docLinks
    .map(
      (link) => `
      <a class="cm-doclink" data-cm-doclink data-url="${escapeHtml(link.url)}">
        <span class="cm-doclink-icon">→</span>
        <span class="cm-doclink-title">${escapeHtml(link.title || link.url)}</span>
        <span class="cm-doclink-source">${escapeHtml(link.source || '')}</span>
      </a>
    `
    )
    .join('');
  return `<div class="cm-doclinks">${items}</div>`;
}

function buildCuratedBubbleHtml(entry, tier, source) {
  const tiers = TIERS.filter((t) => entry[t]);
  const activeTier = tiers.includes(tier) ? tier : tiers[tiers.length - 1] || 'technical';
  const defText = entry[activeTier] || entry.technical || '';
  const sourceBadge = source === 'ai' ? '<span class="cm-ai-badge" title="Definition generated by Claude">AI</span>' : '';

  return `
    <div class="cm-backdrop" data-cm-backdrop>
      <div class="cm-bubble" role="dialog" aria-modal="false" aria-label="Code_Mate definition" data-cm-bubble tabindex="-1">
        <header class="cm-header">
          <h2 class="cm-term">${escapeHtml(entry.term)}${sourceBadge}</h2>
          <span class="cm-chip" data-cat="${escapeHtml(entry.category || 'concept')}">${escapeHtml(entry.category || 'concept')}</span>
          <button class="cm-close" data-cm-close aria-label="Close">×</button>
        </header>
        ${buildTierToggleHtml(activeTier, tiers)}
        <p class="cm-def" data-cm-def>${renderInline(defText)}</p>
        ${
          entry.codeExample
            ? `<div class="cm-code-wrap">
                 <pre class="cm-code"><code data-cm-code>${escapeHtml(entry.codeExample)}</code></pre>
                 <button class="cm-copy-btn" data-cm-copy aria-label="Copy code">Copy</button>
               </div>`
            : ''
        }
        ${buildDocLinksHtml(entry.docLinks)}
        <footer class="cm-footer"><span class="cm-brand">Code_Mate</span></footer>
      </div>
    </div>
  `;
}

function buildUnknownBubbleHtml(queryTerm, settings) {
  const safeQuery = escapeHtml(queryTerm);
  const hasKey = !!settings?.anthropicKey;
  const generateSection = hasKey
    ? `<button class="cm-generate-btn" data-cm-generate>Generate with AI</button>
       <span class="cm-generate-hint">Calls Claude with your key. ~$0.002 per definition. <a data-cm-open-settings>Settings</a></span>`
    : `<span class="cm-generate-hint">Add your Anthropic API key in <a data-cm-open-settings>Settings</a> to generate definitions on demand.</span>`;
  const suggestUrl =
    'https://github.com/CrowHold/code_mate/issues/new?title=' +
    encodeURIComponent(`Suggest term: ${queryTerm}`) +
    '&labels=glossary-request';
  return `
    <div class="cm-backdrop" data-cm-backdrop>
      <div class="cm-bubble" role="dialog" aria-modal="false" aria-label="Code_Mate definition" data-cm-bubble tabindex="-1">
        <header class="cm-header">
          <h2 class="cm-term">${safeQuery}</h2>
          <span class="cm-chip" data-cat="unknown">unknown</span>
          <button class="cm-close" data-cm-close aria-label="Close">×</button>
        </header>
        <div class="cm-generate-wrap">
          <p class="cm-generate-msg">No definition for <strong>${safeQuery}</strong> in the curated glossary yet.</p>
          ${generateSection}
        </div>
        <div class="cm-doclinks">
          <a class="cm-doclink" data-cm-doclink data-url="${escapeHtml(suggestUrl)}">
            <span class="cm-doclink-icon">→</span>
            <span class="cm-doclink-title">Suggest this term</span>
            <span class="cm-doclink-source">github.com</span>
          </a>
        </div>
        <footer class="cm-footer"><span class="cm-brand">Code_Mate</span></footer>
      </div>
    </div>
  `;
}

// ── Positioning ──────────────────────────────────────────────────────────────

function positionBubble(bubbleEl, selectionRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect =
    selectionRect && (selectionRect.width || selectionRect.height)
      ? selectionRect
      : { top: vh / 2, bottom: vh / 2, left: vw / 2, right: vw / 2 };

  const anchorTop = rect.top;
  const anchorBottom = rect.bottom;
  const anchorLeftMid = (rect.left + rect.right) / 2;

  const spaceBelow = vh - anchorBottom - GAP - VIEWPORT_MARGIN;
  const spaceAbove = anchorTop - GAP - VIEWPORT_MARGIN;
  const placeBelow = spaceBelow >= BUBBLE_H_EST || spaceBelow >= spaceAbove;

  let top = placeBelow
    ? anchorBottom + GAP
    : Math.max(VIEWPORT_MARGIN, anchorTop - GAP - BUBBLE_H_EST);

  let left = anchorLeftMid - BUBBLE_W / 2;
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, vw - BUBBLE_W - VIEWPORT_MARGIN));

  const originX = anchorLeftMid - left;
  const originY = placeBelow ? -GAP : BUBBLE_H_EST + GAP;
  bubbleEl.style.setProperty('--cm-origin-x', `${originX}px`);
  bubbleEl.style.setProperty('--cm-origin-y', `${originY}px`);
  bubbleEl.style.top = `${top}px`;
  bubbleEl.style.left = `${left}px`;

  requestAnimationFrame(() => {
    const realH = bubbleEl.offsetHeight;
    if (!placeBelow && anchorTop - GAP - realH < VIEWPORT_MARGIN) {
      bubbleEl.style.top = `${VIEWPORT_MARGIN}px`;
    } else if (placeBelow && top + realH > vh - VIEWPORT_MARGIN) {
      bubbleEl.style.top = `${Math.max(VIEWPORT_MARGIN, vh - VIEWPORT_MARGIN - realH)}px`;
    }
  });
}

function flashWordPulse(selectionRect) {
  if (!selectionRect || !shadowRootRef) return;
  const pulse = document.createElement('div');
  pulse.className = 'cm-word-pulse';
  pulse.style.position = 'fixed';
  pulse.style.top = `${selectionRect.top - 2}px`;
  pulse.style.left = `${selectionRect.left - 4}px`;
  pulse.style.width = `${Math.max(0, selectionRect.width + 8)}px`;
  pulse.style.height = `${Math.max(0, selectionRect.height + 4)}px`;
  pulse.style.pointerEvents = 'none';
  shadowRootRef.appendChild(pulse);
  setTimeout(() => pulse.parentNode && pulse.parentNode.removeChild(pulse), 280);
}

// ── Dismissal & interactions ─────────────────────────────────────────────────

function attachDismissHandlers(bubbleEl, dismiss) {
  const keyHandler = (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
  };
  document.addEventListener('keydown', keyHandler, true);

  // Click-outside detection. The bubble lives in a CLOSED shadow root, so a
  // document-level listener calling composedPath() cannot see nodes inside the
  // shadow tree — every click (including clicks on the bubble's own buttons)
  // would look "outside" and dismiss the bubble before its button handlers
  // could fire. Instead, listen on the backdrop, which is itself inside the
  // shadow root and fills the viewport. A click whose target IS the backdrop
  // is a genuine outside-click; a click on bubble content has a different
  // target (it bubbles up through .cm-bubble) and is left alone.
  const backdrop = bubbleEl.closest('.cm-backdrop');
  const backdropClickHandler = (e) => {
    if (e.target === backdrop) dismiss();
  };
  let backdropAttached = false;
  const attachClickTimer = setTimeout(() => {
    if (backdrop) {
      backdrop.addEventListener('mousedown', backdropClickHandler);
      backdropAttached = true;
    }
  }, 60);

  const startScrollY = window.scrollY;
  const scrollHandler = () => {
    if (Math.abs(window.scrollY - startScrollY) > 60) dismiss();
  };
  window.addEventListener('scroll', scrollHandler, { passive: true });

  return () => {
    clearTimeout(attachClickTimer);
    document.removeEventListener('keydown', keyHandler, true);
    if (backdropAttached && backdrop) {
      backdrop.removeEventListener('mousedown', backdropClickHandler);
    }
    window.removeEventListener('scroll', scrollHandler);
  };
}

function wireDocLinks(bubbleEl) {
  bubbleEl.querySelectorAll('[data-cm-doclink]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = link.getAttribute('data-url');
      if (!url) return;
      try { chrome.runtime.sendMessage({ type: 'cm-open-docs', url }); }
      catch (err) { console.error('[Code_Mate] open-docs send failed:', err); }
    });
  });
}

function wireCopyButton(bubbleEl) {
  const copyBtn = bubbleEl.querySelector('[data-cm-copy]');
  if (!copyBtn) return;
  copyBtn.addEventListener('click', async () => {
    const codeEl = bubbleEl.querySelector('[data-cm-code]');
    if (!codeEl) return;
    const text = codeEl.textContent || '';
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.classList.add('cm-copied');
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => {
        copyBtn.classList.remove('cm-copied');
        copyBtn.textContent = 'Copy';
      }, 1100);
    } catch (_err) {
      const range = document.createRange();
      range.selectNodeContents(codeEl);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
  });
}

function wireSettingsLink(bubbleEl) {
  bubbleEl.querySelectorAll('[data-cm-open-settings]').forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', (e) => {
      e.preventDefault();
      try { chrome.runtime.sendMessage({ type: 'cm-open-settings' }); }
      catch (err) { console.error('[Code_Mate] open-settings send failed:', err); }
    });
  });
}

function wireTierToggle(bubbleEl) {
  bubbleEl.querySelectorAll('[data-cm-tier]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tier = btn.getAttribute('data-cm-tier');
      if (!tier || btn.disabled) return;
      switchTier(bubbleEl, tier);
    });
  });
}

function wireGenerateButton(bubbleEl) {
  const btn = bubbleEl.querySelector('[data-cm-generate]');
  if (!btn) return;
  btn.addEventListener('click', () => handleGenerateClick(bubbleEl, btn));
}

function switchTier(bubbleEl, tier) {
  if (!activeState) return;
  if (activeState.tier === tier) return;
  const def = bubbleEl.querySelector('[data-cm-def]');
  const tierBtns = bubbleEl.querySelectorAll('[data-cm-tier]');
  if (!def) return;

  // crossfade out
  def.classList.add('cm-fading');
  setTimeout(() => {
    const newText = activeState.entry[tier] || activeState.entry.technical || '';
    def.innerHTML = renderInline(newText);
    def.classList.remove('cm-fading');
  }, 130);

  tierBtns.forEach((b) => {
    const t = b.getAttribute('data-cm-tier');
    b.classList.toggle('cm-tier-active', t === tier);
  });

  activeState.tier = tier;
}

async function handleGenerateClick(bubbleEl, btn) {
  if (!activeState || activeState.source !== 'unknown') return;
  const term = activeState.queryTerm;
  btn.setAttribute('disabled', 'true');
  btn.innerHTML = '<span class="cm-generating"></span> Generating…';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'cm-generate', term });
    if (!response?.ok) {
      showGenerateError(bubbleEl, response?.error || 'AI request failed.');
      btn.removeAttribute('disabled');
      btn.textContent = 'Generate with AI';
      return;
    }
    // Replace the bubble's body with curated-style content using the AI entry
    const entry = response.entry;
    rerenderAsCurated(bubbleEl, entry, 'ai');
  } catch (err) {
    showGenerateError(bubbleEl, err?.message || String(err));
    btn.removeAttribute('disabled');
    btn.textContent = 'Generate with AI';
  }
}

function showGenerateError(bubbleEl, message) {
  const wrap = bubbleEl.querySelector('.cm-generate-wrap');
  if (!wrap) return;
  const existing = wrap.parentNode.querySelector('.cm-error');
  if (existing) existing.remove();
  const err = document.createElement('div');
  err.className = 'cm-error';
  err.textContent = message;
  wrap.parentNode.insertBefore(err, wrap);
}

function rerenderAsCurated(bubbleEl, entry, source) {
  const tier = DEFAULT_TIER;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = buildCuratedBubbleHtml(entry, tier, source);
  const newBubble = wrapper.querySelector('[data-cm-bubble]');
  if (!newBubble) return;
  // swap inner contents
  bubbleEl.innerHTML = newBubble.innerHTML;
  // re-wire all interactions on the new content
  wireDocLinks(bubbleEl);
  wireCopyButton(bubbleEl);
  wireTierToggle(bubbleEl);
  wireSettingsLink(bubbleEl);
  bubbleEl.querySelector('[data-cm-close]')?.addEventListener('click', dismissActive);
  activeState = { entry, queryTerm: entry.term, source, tier };
}

function dismissActive() {
  if (!activeBubbleEl) return;
  const bubble = activeBubbleEl;
  const backdrop = bubble.closest('.cm-backdrop');
  const cleanup = activeCleanup;
  activeBubbleEl = null;
  activeCleanup = null;
  activeState = null;
  if (cleanup) cleanup();

  bubble.classList.remove('cm-open');
  bubble.classList.add('cm-closing');
  if (backdrop) backdrop.classList.remove('cm-open');

  let done = false;
  const onEnd = () => {
    if (done) return;
    done = true;
    bubble.removeEventListener('transitionend', onEnd);
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  };
  bubble.addEventListener('transitionend', onEnd);
  setTimeout(onEnd, 240);
}

// ── Public entry point ──────────────────────────────────────────────────────

export async function showBubble({ selectionText, selectionRect }) {
  if (!selectionText || !selectionText.trim()) return;

  // Orphaned context (extension reloaded while this page stayed open): every
  // chrome.* call would throw. Show a plain "refresh the page" notice and stop,
  // rather than letting an uncaught error swallow the whole flow.
  if (!isExtensionContextValid()) {
    showStaleContextNotice(selectionRect);
    return;
  }

  const [glossary, css, aiCache, settings] = await Promise.all([
    loadGlossary(),
    loadCss(),
    loadAiCache(),
    loadSettings(),
  ]);

  const entry = lookup(glossary, selectionText);
  const canon = canonicalKey(selectionText);
  const cachedAi = !entry && aiCache?.[canon] ? aiCache[canon] : null;

  // Dismiss any previous bubble first
  if (activeBubbleEl) {
    const prevBackdrop = activeBubbleEl.closest('.cm-backdrop');
    if (activeCleanup) activeCleanup();
    activeBubbleEl = null;
    activeCleanup = null;
    activeState = null;
    if (prevBackdrop?.parentNode) prevBackdrop.parentNode.removeChild(prevBackdrop);
  }

  const root = ensureHost();
  if (!root.querySelector('style[data-cm-style]')) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-cm-style', '');
    styleEl.textContent = css || '';
    root.appendChild(styleEl);
  }

  flashWordPulse(selectionRect);

  setTimeout(() => {
    const wrapper = document.createElement('div');
    let source, displayEntry, queryTerm;
    if (entry) {
      source = 'curated';
      displayEntry = entry;
      queryTerm = entry.term;
      wrapper.innerHTML = buildCuratedBubbleHtml(entry, DEFAULT_TIER, source);
    } else if (cachedAi) {
      source = 'ai';
      displayEntry = cachedAi;
      queryTerm = cachedAi.term;
      wrapper.innerHTML = buildCuratedBubbleHtml(cachedAi, DEFAULT_TIER, source);
    } else {
      source = 'unknown';
      displayEntry = null;
      queryTerm = selectionText.trim();
      wrapper.innerHTML = buildUnknownBubbleHtml(queryTerm, settings);
    }
    const backdrop = wrapper.firstElementChild;
    const bubble = backdrop.querySelector('[data-cm-bubble]');
    root.appendChild(backdrop);

    positionBubble(bubble, selectionRect);

    requestAnimationFrame(() => {
      backdrop.classList.add('cm-open');
      bubble.classList.add('cm-open');
    });

    bubble.querySelector('[data-cm-close]')?.addEventListener('click', dismissActive);
    wireDocLinks(bubble);
    wireCopyButton(bubble);
    wireTierToggle(bubble);
    wireGenerateButton(bubble);
    wireSettingsLink(bubble);

    activeBubbleEl = bubble;
    activeCleanup = attachDismissHandlers(bubble, dismissActive);
    activeState = {
      entry: displayEntry,
      queryTerm,
      source,
      tier: DEFAULT_TIER,
    };
  }, 80);
}
