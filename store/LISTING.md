# Code_Mate — Chrome Web Store Listing Copy

Drop-in copy for the Chrome Web Store developer dashboard. Plain text where the
form requires it; this file just holds the source.

---

## Extension name

```
Code_Mate
```

## Category

```
Developer Tools
```

## Language

```
English (Australia)
```

## Summary (short description — max 132 characters)

```
Right-click any coding term for an instant definition, a code example, and links to the official docs.
```

(101 characters.)

## Detailed description

```
Code_Mate is a coding glossary that lives in your flow.

Reading code on the web and hit a term you do not know? Right-click it, choose
"Define with Code_Mate", and a bubble springs from the word with a clear
definition, a code example, and links to authoritative documentation. No new
tab. No search. No losing your place.

FOUR LEVELS OF DEPTH
Every definition comes in four tiers, and you switch between them with one click:
- Tech: a single precise sentence.
- ELI14: deep scaffolding, beginner-friendly, an everyday analogy plus the code.
- ELI19: general technical, the default for most developers.
- ELI25: peer-level shorthand, just the part that changes a decision.

Pick the depth that matches what you need in the moment.

20 CURATED TERMS, PLUS THE LONG TAIL
Code_Mate ships with hand-written entries covering React, Next.js, JavaScript
hooks, and broader AI/ML and command-line terms (grep, embedding, RAG,
transformer, context window). For anything outside that set, an optional AI
fallback can generate a definition on demand using your own Anthropic API key.
Generated definitions are cached locally, so the same term never costs you twice.

PRIVATE BY DEFAULT
Code_Mate has no analytics, no telemetry, no account, and no server of its own.
The glossary is bundled in the extension and works offline. Your API key, if you
add one, is stored only in your browser and is sent only to Anthropic, only when
you explicitly ask for an AI definition.

OPEN SOURCE
Every line is public and unminified at github.com/CrowHold/code_mate. What you
read in the source is exactly what runs.

Built by Crow_Code.
```

## Single-purpose description (Web Store requires this)

```
Code_Mate is a coding glossary. Its single purpose is to provide definitions for
technical terms when the user right-clicks them on a web page.
```

## Store assets checklist (operator supplies)

- [ ] Icon 128x128 (have it: copper tile, black crow)
- [ ] Hero / marquee 1280x800 (Nano Banana prompt supplied)
- [ ] Small promo tile 440x280 (Nano Banana prompt supplied)
- [ ] Screenshots, 1280x800 or 640x400, 1 to 5 — recommended set:
  1. Right-click context menu on a real docs page (the trigger)
  2. Bubble open on a curated term, ELI19 tier showing
  3. The ELI tier toggle mid-switch (shows the four-tier feature)
  4. AI fallback: a generated definition with the AI badge
  5. Settings page (BYOK key field, "Active" state)
- [ ] Privacy policy URL — see note below

## Privacy policy URL

The policy ships inside the extension at `privacy.html`. The Web Store needs a
hosted URL. Until the permanent Crow_Code product domain is live, use a
placeholder that resolves:
`https://github.com/CrowHold/code_mate/blob/main/extension/privacy.html`
Swap to the permanent product privacy URL once that domain is up. The Web Store
lets you update the URL without re-submitting.

## Notes

- v0.2 ships fully free. No pricing, no payment gate, no Pro-tier copy in the
  listing. Monetisation arrives in a later version.
- Do not put "CONCEPT DEMO" banners on screenshots. Use real pages.
