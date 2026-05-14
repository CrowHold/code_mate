# Code_Mate — Permission Justifications

Copy for the Chrome Web Store review form. Each manifest permission has a
justification field in the dashboard; paste the matching block. Reviewers reject
submissions where a permission is broader than the stated justification, so
these are written tight and honest.

---

## Single purpose

```
Code_Mate is a coding glossary. Its single purpose is to provide definitions for
technical terms when the user right-clicks them on a web page. Every permission
below serves only that purpose.
```

---

## `contextMenus`

```
Code_Mate's only trigger is a right-click context-menu item, "Define with
Code_Mate", shown on selected text. This permission is required to add that
item. It is the sole entry point to the extension.
```

## `storage`

```
Used for chrome.storage.local only. Code_Mate stores: (1) an indexed copy of its
own bundled glossary file, so lookups work offline and instantly; (2) a local
cache of any AI-generated definitions, so the same term is not regenerated and
re-billed; (3) the user's settings — their own optional Anthropic API key and a
single preference toggle. No data is written to any remote store.
```

## `scripting`

```
When the user triggers a lookup, Code_Mate must ensure its content script is
present in the active tab before showing the definition bubble. On tabs that
were open before the extension was installed or updated, the content script is
not yet there. chrome.scripting is used to inject it at that moment. Injection
happens only in direct response to the user's right-click action, never
proactively, never in the background, and never on tabs the user has not
interacted with.
```

## Host permission: `<all_urls>`

```
Code_Mate's core function is "right-click any coding term, on any page". A
developer reads code across documentation sites, GitHub, Stack Overflow, blog
posts, and internal tools. Restricting to a fixed host list would break that
core function. The extension accesses a page only when the user explicitly
right-clicks selected text on it, and it reads only that selected text. It does
not scan, read, collect, or transmit page content, the DOM, or browsing
activity.
```

## Host permission: `https://api.anthropic.com/*`

```
Required for the optional AI fallback. When a term is not in the bundled
glossary, the user may choose "Generate with AI". Code_Mate then calls the
Anthropic Messages API directly from its service worker, authenticated with an
API key the user supplied themselves in Settings. This host permission is the
minimum scope needed for that single API endpoint. It is exercised only on
explicit user action, and only when the user has saved a key.
```

---

## Remote code

```
Code_Mate does not use remote code. All JavaScript, CSS, and the glossary data
are bundled in the extension package and run as-is, unminified. The extension
makes two kinds of network request, neither of which is executable code:
1. Web fonts loaded from Google Fonts' CDN for the bubble UI (a standard styling
   resource fetch).
2. Optional, user-initiated calls to the Anthropic API using the user's own key.
No script, module, or WASM is fetched and executed from a remote source.
```

---

## Data usage disclosures (dashboard checkboxes)

For the "Data usage" section of the dashboard:

- **Does this item collect or use personal or sensitive user data?**
  No personal or sensitive data is collected by Code_Mate itself. The extension
  has no analytics, no telemetry, no account system, and no server of its own.

- **The one disclosure to make:** when the user explicitly invokes the AI
  fallback, the single term they selected is transmitted to the Anthropic API
  under the user's own API key and account. Code_Mate does not receive, store, or
  see a copy of this beyond the local-only cache on the user's own device.
  Anthropic's privacy policy governs that request. This is fully described in the
  extension's privacy policy.

- **Certify the three required statements:**
  - Not sold or transferred to third parties (outside approved use cases): TRUE.
  - Not used or transferred for purposes unrelated to the item's single purpose:
    TRUE.
  - Not used or transferred to determine creditworthiness or for lending: TRUE.

---

## If a reviewer pushes back

The most likely query is on `<all_urls>`. The answer: the extension's value is
universality — it cannot know in advance which page a developer will be reading
code on. Point the reviewer to the open-source repository
(github.com/CrowHold/code_mate); the content script reads only
`window.getSelection()` on an explicit context-menu click and never touches the
broader DOM. The code is short and unobfuscated; it can be verified in minutes.
