// Code_Mate content script.
// Runs on every page at document_idle. Listens for cm-define messages from background.js.
// On first invocation per page, dynamically imports bubble.js (the heavy lifting module).
// Subsequent invocations reuse the module's persistent Shadow DOM host.

let bubbleModulePromise = null;

// True only while this content script's extension context is live. After an
// extension reload, a content script left in an already-open tab is "orphaned":
// chrome.runtime.id goes undefined and every chrome.* call throws.
function isContextValid() {
  try {
    return !!(chrome.runtime && chrome.runtime.id);
  } catch (_e) {
    return false;
  }
}

function loadBubbleModule() {
  if (!bubbleModulePromise) {
    // Cache-bust the module URL. After an extension reload the page's module
    // registry can still hold a stale bubble.js from a now-orphaned content
    // script; a unique query string forces a fresh module bound to this live
    // content-script context.
    const url = chrome.runtime.getURL('bubble.js') + '?t=' + Date.now();
    bubbleModulePromise = import(url).catch((err) => {
      console.error('[Code_Mate] bubble.js import failed:', err);
      bubbleModulePromise = null;
      throw err;
    });
  }
  return bubbleModulePromise;
}

function readSelectionRect() {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  } catch (_err) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== 'cm-define') return;
  // Orphaned-context guard: if the extension was reloaded, this content script is
  // stale and its chrome.* APIs are dead. Bail silently — background.js injects a
  // fresh content script (via chrome.scripting) that handles the message instead.
  if (!isContextValid()) return;
  const selectionText = msg.selectionText || '';
  if (!selectionText.trim()) return;
  const selectionRect = readSelectionRect();
  loadBubbleModule()
    .then((mod) => {
      if (typeof mod.showBubble === 'function') {
        mod.showBubble({ selectionText, selectionRect });
      }
    })
    .catch(() => {
      // Already logged in loadBubbleModule
    });
});
