// Code_Mate bubble module.
// Owns the persistent Shadow DOM host, glossary lookup, positioning, animations, and dismissal.
// Loaded via dynamic import from content.js on first invocation per page.

const HOST_ID = '__codemate_host__';
const STORAGE_KEY = 'glossary';

const BUBBLE_W = 380;
const BUBBLE_H_EST = 280;
const GAP = 12;
const VIEWPORT_MARGIN = 16;

let cachedGlossary = null;
let cachedCss = null;
let shadowRootRef = null;
let activeCleanup = null;
let activeBubbleEl = null;
let activePulseEl = null;

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

async function loadGlossary() {
  if (cachedGlossary) return cachedGlossary;
  const result = await chrome.storage.local.get(STORAGE_KEY);
  cachedGlossary = result?.[STORAGE_KEY] || null;
  // Listen for updates (e.g. on extension reload mid-session).
  if (chrome.storage?.onChanged && !loadGlossary._listening) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes[STORAGE_KEY]) {
        cachedGlossary = changes[STORAGE_KEY].newValue || null;
      }
    });
    loadGlossary._listening = true;
  }
  return cachedGlossary;
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

function ensureHost() {
  let host = document.getElementById(HOST_ID);
  if (host && shadowRootRef) return shadowRootRef;
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText =
      'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';
    (document.documentElement || document.body).appendChild(host);
  }
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

function buildBubbleHtml(entry, queryTerm) {
  if (!entry) {
    const safeQuery = escapeHtml(queryTerm || 'this term');
    const suggestUrl =
      'https://github.com/CrowHold/code_mate/issues/new?title=' +
      encodeURIComponent(`Suggest term: ${queryTerm || ''}`) +
      '&labels=glossary-request';
    return `
      <div class="cm-backdrop" data-cm-backdrop>
        <div class="cm-bubble" role="dialog" aria-modal="false" aria-label="Code_Mate definition" data-cm-bubble tabindex="-1">
          <header class="cm-header">
            <h2 class="cm-term">${safeQuery}</h2>
            <span class="cm-chip" data-cat="unknown">unknown</span>
            <button class="cm-close" data-cm-close aria-label="Close">×</button>
          </header>
          <p class="cm-oneliner">No definition for <strong>${safeQuery}</strong> yet. Help us add it.</p>
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

  const docs = (entry.docLinks || [])
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

  return `
    <div class="cm-backdrop" data-cm-backdrop>
      <div class="cm-bubble" role="dialog" aria-modal="false" aria-label="Code_Mate definition" data-cm-bubble tabindex="-1">
        <header class="cm-header">
          <h2 class="cm-term">${escapeHtml(entry.term)}</h2>
          <span class="cm-chip" data-cat="${escapeHtml(entry.category || 'concept')}">${escapeHtml(entry.category || 'concept')}</span>
          <button class="cm-close" data-cm-close aria-label="Close">×</button>
        </header>
        <p class="cm-oneliner">${escapeHtml(entry.oneLiner || '')}</p>
        ${
          entry.codeExample
            ? `<div class="cm-code-wrap">
                 <pre class="cm-code"><code data-cm-code>${escapeHtml(entry.codeExample)}</code></pre>
                 <button class="cm-copy-btn" data-cm-copy aria-label="Copy code">Copy</button>
               </div>`
            : ''
        }
        ${docs ? `<div class="cm-doclinks">${docs}</div>` : ''}
        <footer class="cm-footer"><span class="cm-brand">Code_Mate</span></footer>
      </div>
    </div>
  `;
}

function positionBubble(bubbleEl, selectionRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Fall back to viewport centre if no selection rect (e.g. selection collapsed before we read it).
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

  // transform-origin relative to the bubble's own box → makes it spring from the word
  const originX = anchorLeftMid - left;
  const originY = placeBelow ? -GAP : BUBBLE_H_EST + GAP;
  bubbleEl.style.setProperty('--cm-origin-x', `${originX}px`);
  bubbleEl.style.setProperty('--cm-origin-y', `${originY}px`);
  bubbleEl.style.top = `${top}px`;
  bubbleEl.style.left = `${left}px`;

  // After first paint, re-clamp top if the real height exceeded our estimate
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
  if (!selectionRect) return;
  // Render a non-interactive pulse overlay inside the host shadow root, not in the host DOM (we never mutate host markup).
  if (!shadowRootRef) return;
  const pulse = document.createElement('div');
  pulse.className = 'cm-word-pulse';
  pulse.style.position = 'fixed';
  pulse.style.top = `${selectionRect.top - 2}px`;
  pulse.style.left = `${selectionRect.left - 4}px`;
  pulse.style.width = `${Math.max(0, selectionRect.width + 8)}px`;
  pulse.style.height = `${Math.max(0, selectionRect.height + 4)}px`;
  pulse.style.pointerEvents = 'none';
  shadowRootRef.appendChild(pulse);
  activePulseEl = pulse;
  setTimeout(() => {
    if (pulse.parentNode) pulse.parentNode.removeChild(pulse);
    if (activePulseEl === pulse) activePulseEl = null;
  }, 280);
}

function attachDismissHandlers(bubbleEl, backdropEl, dismiss) {
  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismiss();
    }
  };
  document.addEventListener('keydown', keyHandler, true);

  // Click outside — composedPath() to handle shadow DOM correctly
  const clickHandler = (e) => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    if (!path.includes(bubbleEl)) dismiss();
  };
  // Delay so the click that opened the bubble doesn't immediately close it
  const attachClickTimer = setTimeout(() => {
    document.addEventListener('mousedown', clickHandler, true);
  }, 60);

  const startScrollY = window.scrollY;
  const scrollHandler = () => {
    if (Math.abs(window.scrollY - startScrollY) > 60) dismiss();
  };
  window.addEventListener('scroll', scrollHandler, { passive: true });

  return () => {
    clearTimeout(attachClickTimer);
    document.removeEventListener('keydown', keyHandler, true);
    document.removeEventListener('mousedown', clickHandler, true);
    window.removeEventListener('scroll', scrollHandler);
  };
}

function wireBubbleInteractions(bubbleEl, dismiss) {
  // Close button
  const closeBtn = bubbleEl.querySelector('[data-cm-close]');
  if (closeBtn) closeBtn.addEventListener('click', dismiss);

  // Doc links → background opens popout
  const links = bubbleEl.querySelectorAll('[data-cm-doclink]');
  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const url = link.getAttribute('data-url');
      if (!url) return;
      try {
        chrome.runtime.sendMessage({ type: 'cm-open-docs', url });
      } catch (err) {
        console.error('[Code_Mate] open-docs send failed:', err);
      }
    });
  });

  // Copy button
  const copyBtn = bubbleEl.querySelector('[data-cm-copy]');
  if (copyBtn) {
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
      } catch (err) {
        // Some pages block clipboard access; fall back to range selection
        const range = document.createRange();
        range.selectNodeContents(codeEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      }
    });
  }
}

function dismissActive() {
  if (!activeBubbleEl) return;
  const bubble = activeBubbleEl;
  const backdrop = bubble.closest('.cm-backdrop');
  const cleanup = activeCleanup;
  activeBubbleEl = null;
  activeCleanup = null;
  if (cleanup) cleanup();

  bubble.classList.remove('cm-open');
  bubble.classList.add('cm-closing');
  if (backdrop) backdrop.classList.remove('cm-open');

  const removeNow = () => {
    if (backdrop && backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
  };
  // Wait for exit animation, with a safety fallback
  let done = false;
  const onEnd = () => {
    if (done) return;
    done = true;
    bubble.removeEventListener('transitionend', onEnd);
    removeNow();
  };
  bubble.addEventListener('transitionend', onEnd);
  setTimeout(onEnd, 240);
}

export async function showBubble({ selectionText, selectionRect }) {
  if (!selectionText || !selectionText.trim()) return;

  const [glossary, css] = await Promise.all([loadGlossary(), loadCss()]);
  const entry = lookup(glossary, selectionText);

  // If a previous bubble is still open, dismiss it first (no animation overlap)
  if (activeBubbleEl) {
    const prev = activeBubbleEl;
    const prevBackdrop = prev.closest('.cm-backdrop');
    if (activeCleanup) activeCleanup();
    activeBubbleEl = null;
    activeCleanup = null;
    if (prevBackdrop && prevBackdrop.parentNode) prevBackdrop.parentNode.removeChild(prevBackdrop);
  }

  const root = ensureHost();

  // Inject CSS into shadow root once
  if (!root.querySelector('style[data-cm-style]')) {
    const styleEl = document.createElement('style');
    styleEl.setAttribute('data-cm-style', '');
    styleEl.textContent = css || '';
    root.appendChild(styleEl);
  }

  // Fire the word pulse first; bubble mounts ~80ms later so the pulse feels causal
  flashWordPulse(selectionRect);

  setTimeout(() => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildBubbleHtml(entry, selectionText);
    const backdrop = wrapper.firstElementChild;
    const bubble = backdrop.querySelector('[data-cm-bubble]');
    root.appendChild(backdrop);

    positionBubble(bubble, selectionRect);

    // Next frame → trigger the entrance transition
    requestAnimationFrame(() => {
      backdrop.classList.add('cm-open');
      bubble.classList.add('cm-open');
    });

    wireBubbleInteractions(bubble, dismissActive);
    activeBubbleEl = bubble;
    activeCleanup = attachDismissHandlers(bubble, backdrop, dismissActive);
  }, 80);
}
