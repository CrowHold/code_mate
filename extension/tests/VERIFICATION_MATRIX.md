# Code_Mate v0.2 — Verification Matrix

Run this matrix against `tests/test-fixture.html` after every material change. All checks must pass before pushing a release commit.

**How to run:** Load the extension unpacked from `extension/`, open `tests/test-fixture.html` directly in Chrome (drag-and-drop or `file://` URL), and walk each row. Mark Pass/Fail/Skip in the Status column. Date and sign the Run Log entry at the bottom.

---

## 1. Core trigger

| # | Check | Expected | Status |
|---|---|---|---|
| 1.1 | Select `useState`, right-click | "Define with Code_Mate" appears in context menu | |
| 1.2 | Click menu item | Word pulse fires (copper flash), bubble springs open within ~120ms | |
| 1.3 | Select whitespace only, right-click and trigger | No bubble opens; no error in console | |
| 1.4 | Trigger on `chrome://extensions` | Menu item absent or click produces no action | |
| 1.5 | Trigger on `chrome-extension://` URL | No bubble, no JS error | |

---

## 2. Bubble render — curated entry

| # | Check | Expected | Status |
|---|---|---|---|
| 2.1 | Term heading | Displays exact term string, `JetBrains Mono` or monospace fallback | |
| 2.2 | Category chip | Correct colour per category (keyword=copper, function=blue, concept=purple, config=green, command=orange) | |
| 2.3 | ELI25 active by default | ELI25 button highlighted in copper; ELI25 definition text visible | |
| 2.4 | All four tier buttons present | TECH / ELI14 / ELI19 / ELI25 all render; none disabled for a full entry | |
| 2.5 | TECH button click | Definition text crossfades to technical one-liner within ~150ms | |
| 2.6 | ELI14 button click | Definition text crossfades to ELI14 content | |
| 2.7 | ELI19 button click | Definition text crossfades to ELI19 content | |
| 2.8 | Back to ELI25 | Crossfades back; active button updates | |
| 2.9 | Code example | Renders in monospace block with copy button visible | |
| 2.10 | Copy button click | Clipboard receives code text; button shows "✓ Copied" for ~1.1s then resets | |
| 2.11 | Doc link click | Opens 480×720 popup window with correct URL | |
| 2.12 | Footer | "Code_Mate" brand text visible in `JetBrains Mono` or monospace fallback | |

---

## 3. Bubble render — unknown term

| # | Check | Expected | Status |
|---|---|---|---|
| 3.1 | Select `git rebase` (no key set) | Unknown bubble with "Add your API key in Settings" hint; no Generate button | |
| 3.2 | Settings link in hint | Click opens settings.html tab | |
| 3.3 | Select `git rebase` (key set) | Unknown bubble shows "Generate with AI" button | |
| 3.4 | Click "Generate with AI" | Button disables, spinner appears, definition fetched from Anthropic API | |
| 3.5 | Successful AI generation | Bubble re-renders as curated style; AI badge (purple) next to term | |
| 3.6 | Same term right-clicked again | Cache hit — bubble opens instantly, AI badge present, no API call made | |
| 3.7 | API error (wrong key) | Error message displayed in bubble; button re-enables | |
| 3.8 | "Suggest this term" link | Opens GitHub issue with pre-filled title `Suggest term: git rebase` | |

---

## 4. Lookup robustness

All the following variants must resolve to the same canonical entry as the plain term.

| # | Variant | Canonical entry expected | Status |
|---|---|---|---|
| 4.1 | `USE-CLIENT` | `use client` | |
| 4.2 | `"force-dynamic,"` (with quotes and comma) | `force-dynamic` | |
| 4.3 | `force dynamic` (space instead of hyphen) | `force-dynamic` | |
| 4.4 | `force_dynamic` (underscore) | `force-dynamic` | |
| 4.5 | `use_effect` | `useEffect` | |
| 4.6 | `EGREP` | `grep` | |

---

## 5. Positioning

| # | Check | Expected | Status |
|---|---|---|---|
| 5.1 | Term near right edge of viewport | Bubble stays within viewport; does not clip right | |
| 5.2 | Term near left edge | Bubble stays within viewport; does not clip left | |
| 5.3 | Term at bottom of viewport | Bubble flips above the selection | |
| 5.4 | Term near top of viewport | Bubble opens below the selection | |
| 5.5 | Mid-scroll trigger | Bubble positioned relative to word, not page origin | |
| 5.6 | Spring origin | Scale animation originates from approximately the selected word | |

---

## 6. Dismissal

| # | Check | Expected | Status |
|---|---|---|---|
| 6.1 | Press Escape | Bubble closes with exit animation (~150ms) | |
| 6.2 | Click outside bubble | Bubble closes with exit animation | |
| 6.3 | Click inside bubble | Bubble stays open | |
| 6.4 | Scroll 60px+ down | Bubble closes | |
| 6.5 | Scroll less than 60px | Bubble stays open | |
| 6.6 | Close button (×) | Bubble closes | |
| 6.7 | Open bubble while one is already open | First bubble removed immediately, new one opens | |

---

## 7. Visual / theme

| # | Check | Expected | Status |
|---|---|---|---|
| 7.1 | macOS/OS dark mode | Dark bubble (#1a1a1c background, copper accents) | |
| 7.2 | macOS/OS light mode | Light bubble (#fafaf8 background, adjusted accents) | |
| 7.3 | Backdrop blur | Semi-transparent blur on rest of page while bubble is open | |
| 7.4 | Word pulse | Copper ring flash around selected text before bubble opens | |
| 7.5 | Font rendering | Instrument Sans in definition body; JetBrains Mono in term, tiers, code, footer | |
| 7.6 | Reduced motion (OS setting) | No scale animation, no pulse, no crossfade; bubble renders instantly | |
| 7.7 | Reduced motion dismiss | Bubble disappears without transition | |

---

## 8. Font loading (v0.2.x addition)

| # | Check | Expected | Status |
|---|---|---|---|
| 8.1 | DevTools Network tab | Requests to `fonts.gstatic.com` for Instrument Sans and JetBrains Mono woff2 files | |
| 8.2 | Preconnect hints | `<link rel="preconnect" href="https://fonts.gstatic.com">` present in `<head>` after first trigger | |
| 8.3 | Font render (online) | Bubble text uses Instrument Sans (not system fallback); term uses JetBrains Mono | |
| 8.4 | Font render (offline / CDN blocked) | Bubble renders with system fallback fonts; no broken layout | |
| 8.5 | No duplicate preconnect tags | Trigger bubble twice; only one set of preconnect tags in `<head>` | |

---

## 9. Settings page

| # | Check | Expected | Status |
|---|---|---|---|
| 9.1 | Open via toolbar icon click | settings.html opens in a new tab | |
| 9.2 | Open via in-bubble Settings link | settings.html opens; bubble closes | |
| 9.3 | Enter API key, click Save | Key persists across extension reload; status pill shows "Key saved" | |
| 9.4 | Clear key | Key removed; status pill reverts to "No key" | |
| 9.5 | Sonnet-for-ELI25 toggle | Toggle state persists across reload | |
| 9.6 | Clear AI cache button | Cache cleared; subsequent AI lookups hit API again | |
| 9.7 | Entry count | Shows 20 (or current glossary count) | |

---

## 10. Privacy page

| # | Check | Expected | Status |
|---|---|---|---|
| 10.1 | Navigate to `chrome-extension://[id]/privacy.html` | Page loads with correct title and content | |
| 10.2 | Dark mode | Matches settings.html dark theme | |
| 10.3 | Light mode | Matches settings.html light theme | |
| 10.4 | All external links | Open in new tab with `rel="noopener noreferrer"` | |

---

## 11. Performance

| # | Check | Expected | Status |
|---|---|---|---|
| 11.1 | DevTools Performance: bubble entrance | No layout thrash; 60fps spring animation | |
| 11.2 | Memory: open/close 20 times | No growing heap; backdrop nodes cleaned up | |
| 11.3 | Console errors | Zero errors on clean walk of all curated entries | |
| 11.4 | Service worker wake time | Background.js responds to context menu within 1s on first wake | |

---

## 12. Real-page smoke test

Run after the test-fixture pass. Open each URL, find a term, trigger.

| # | Page | Term | Expected | Status |
|---|---|---|---|---|
| 12.1 | nextjs.org/docs | `use client` | Curated entry, full ELI tiers | |
| 12.2 | react.dev | `useEffect` | Curated entry, code example | |
| 12.3 | GitHub PR diff view | `middleware` | Curated entry | |
| 12.4 | Stack Overflow question | `hydration` | Curated entry | |
| 12.5 | Any page | `vector database` | AI fallback (if key set) | |

---

## Run log

| Date | Version | Operator | Pass | Fail | Skip | Notes |
|---|---|---|---|---|---|---|
| | v0.2.x | | | | | |

---

*Add a row to the run log each time this matrix is walked. Failures must be tracked in TASKS.md before a release commit.*
