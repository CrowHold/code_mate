# Code_Mate

A coding glossary that lives in your flow.

Right-click any coding term on any web page. A bubble springs from the word with a definition, a code example, and links to authoritative docs. No alt-tab. No docs navigation. One second, back to reading code.

## Status

v0.1 — standalone Chrome extension. 15 curated React / Next.js terms. Not yet on the Chrome Web Store.

## Load it

```
chrome://extensions → Developer mode ON → Load unpacked → select extension/
```

After code changes: click the ↺ reload icon on the extension card.

## Try it

Right-click any of these on any page and pick **"Define with Code_Mate"** from the context menu:

```
force-dynamic   use client   useEffect   Suspense   hydration
```

## Architecture

No build step. Vanilla JS. Plain CSS. Direct load.

```
extension/
├── manifest.json              MV3 manifest
├── background.js              Service worker: context menu, glossary seeding, popout opener
├── content.js                 Per-page message listener
├── bubble.js                  Shadow DOM bubble: positioning, animation, dismissal
├── bubble.css                 Spring animations, theme, micro-interactions
├── data/glossary.json         15 curated entries (v0.1)
├── popout/docs.html           Iframe shell for "Learn more" links
└── icons/                     16/48/128 icons
```

## Roadmap

- **v0.1** — Scaffold + 15 curated terms (you are here)
- **v0.2** — 200 terms, Chrome Web Store submission
- **v0.3** — Hover trigger, keyboard shortcut, telemetry
- **v0.4** — Context Copilot skill integration

## Brand

Built by [Crow_Code](https://crowcode.dev). Solo builder, Central Coast NSW.

## Licence

MIT.
