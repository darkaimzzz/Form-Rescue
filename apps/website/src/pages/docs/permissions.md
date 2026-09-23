---
layout: ../../layouts/Doc.astro
title: Permissions
description: Every permission Form Rescue requests, why, and how per-site access and revocation work.
---

| Permission | Why | Limits |
| --- | --- | --- |
| `storage` | Presentation preferences and install state | Drafts are never synced; they live in IndexedDB |
| `scripting` | Run Form Rescue's packaged script on sites you enabled | Only enabled sites; no remote code |
| `activeTab` | Read the current tab's address when you click the toolbar button | Not used for ongoing protection |
| `alarms` | Periodic clean-up of expired drafts | Timing isn't exact; clean-up also runs on use |
| Optional site access (`http`/`https`) | Save drafts on a site across reloads | Requested for one scheme + host at a time, only when you click Enable |

Form Rescue doesn't request access to all sites, your tabs list, history, cookies, network requests, downloads, clipboard reading, or unlimited storage.

## How site access works

When you click **Enable protection for this site**, the browser asks to allow access to that host, for example `https://forms.example/*`. Browsers can't limit permissions by port, so Form Rescue applies a stricter rule itself: protection covers the exact scheme, host **and port** you enabled. It never expands to subdomains or from `http` to `https`.

Browser permission and Form Rescue's own setting are separate. Having access to a site doesn't turn protection on; only the Enable button does.

## Disabling and revocation

- **Disable this site** stops saving immediately and asks whether to delete the site's drafts (deleting is the default). If you keep them, they stay in this browser until they expire.
- **Removing access in the browser's own settings** (for example `chrome://extensions` → Site access) also stops saving immediately, and Form Rescue deletes that site's drafts, because it can't tell whether you meant to keep them. If this happens while the extension isn't running, it happens the next time it runs.

Scripts already running in open tabs are told to stop and every later save from them is refused.

## Firefox

Firefox shows the same per-site request. Its add-on listing declares that Form Rescue collects and transmits no data.
