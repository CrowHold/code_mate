# Code_Mate

A coding glossary that lives in your flow.

Right-click any coding term on any web page. A bubble springs from the word with a tiered definition (Tech / ELI14 / ELI19 / ELI25), a code example, and links to authoritative docs. No alt-tab. No docs navigation. One second, back to reading code.

## Status

v0.2 — standalone Chrome extension. 20 curated terms covering React, Next.js, JS hooks, plus broader AI/ML and CLI terms (`grep`, `embedding`, `RAG`, `transformer`, `context window`). AI fallback for unknown terms via your own Anthropic API key. Not yet on the Chrome Web Store.

## What's new in v0.2

- **ELI tiered explanations.** Every entry has four levels: a one-line technical definition, ELI14 (deep scaffolding, code alongside concept), ELI19 (general technical, default for most devs), ELI25 (peer-level shorthand). Toggle between them with the chip strip at the top of the bubble.
- **AI fallback.** When a term isn't in the curated glossary, click "Generate with AI" — Code_Mate sends the term to Claude with your Anthropic API key, generates all four tiers, caches the result locally so repeat lookups cost nothing.
- **Broader scope.** Not just React anymore. `grep`, `sed` (via AI), embedding, RAG, transformer, context window. The curated set is a kernel; the AI fallback handles the long tail.
- **Settings page.** Add your Anthropic key, toggle Sonnet for deeper ELI25 answers (reserved for v0.3), clear the AI cache. Click the extension icon in the toolbar to open.

## Load it

```
chrome://extensions → Developer mode ON → Load unpacked → select extension/
```

After code changes: click the ↺ reload icon on the extension card.

## Try it

Right-click any of these on any page and pick **"Define with Code_Mate"**:

```
force-dynamic   use client   useEffect   Suspense   hydration
grep            embedding    RAG         transformer context window
```

For terms outside the curated set, add your Anthropic API key in Settings and use the AI fallback. Definitions cost ~$0.002 each, cached forever.

## Architecture

No build step. Vanilla JS. Plain CSS. Direct load.

```
extension/
├── manifest.json              MV3 manifest
├── background.js              Service worker: context menu, glossary seeding, AI calls, popout opener
├── content.js                 Per-page message listener
├── bubble.js                  Shadow DOM bubble: positioning, animation, ELI tier toggle, AI flow
├── bubble.css                 Spring animations, theme, micro-interactions, ELI chip styling
├── settings.html              Settings page (BYOK Anthropic key, Sonnet toggle, cache clear)
├── settings.js                Settings page state
├── data/glossary.json         20 curated entries with full ELI coverage
├── popout/docs.html           Iframe shell for "Learn more" links
├── tests/test-fixture.html    Manual verification page
└── icons/                     16/48/128 icons
```

## ELI framework

The four-tier system is built on the [ELI process](https://github.com/CrowHold/code_mate/blob/main/README.md#eli-framework) — explain like I'm [age]. The age isn't a measure of intelligence; it's a measure of conceptual scaffolding required for the specific topic at hand.

- **Tech** — one line, technically correct, no scaffolding
- **ELI14** — deep coding scaffolding. Code alongside concept. One abstraction layer at a time.
- **ELI19** — general technical work. Terms defined inline. 1-2 abstraction layers. Default tier.
- **ELI25** — peer-level. Technical shorthand accepted. Focus on the specific decision.

## Roadmap

- **v0.1** — Scaffold + 15 curated terms ✓
- **v0.2** — ELI tiers + AI fallback + broader scope (you are here)
- **v0.3** — Hover trigger, keyboard shortcut, OpenAI provider, telemetry
- **v0.4** — Context Copilot skill integration

## Brand

Built by [Crow_Code](https://crowcode.dev). Solo builder, Central Coast NSW.

## Licence

MIT.
