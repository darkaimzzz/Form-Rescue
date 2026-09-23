---
layout: ../../layouts/Doc.astro
title: Documentation
description: How to install, use and build Form Rescue, the local, open-source form draft recovery extension.
---

Form Rescue saves eligible drafts on the sites you enable, in this browser profile, so you can recover them after a refresh, a closed tab, a crash or an expired sign-in.

It's an **alpha**. Everything described here is implemented and tested on synthetic pages; see [browser support](/docs/browser-support/) for exactly which browsers were exercised.

## Start here

- [Getting started](/docs/getting-started/) — install the developer build and protect your first site.
- [Recovering drafts](/docs/recovery/) — review, restore, copy and undo.
- [Privacy and storage](/docs/privacy-and-storage/) — what is stored, where, for how long, and the limits.
- [Permissions](/docs/permissions/) — every permission and why it's needed.
- [Browser support](/docs/browser-support/) — tested versions and known differences.
- [Troubleshooting](/docs/troubleshooting/) — common problems and how to report issues safely.
- [Contributing](/docs/contributing/) — build from source, run tests, license.

## What it can and can't do

| It will | It won't |
| --- | --- |
| Save text you edit in ordinary text boxes and text areas on enabled sites | Save anything on sites you haven't enabled |
| Save non-sensitive dropdown, checkbox and radio choices | Save passwords, codes, payment, bank or identity fields |
| Keep up to three recent versions per draft for 1, 7 or 30 days | Keep drafts forever or sync them anywhere |
| Show saved values in its own page and restore the fields you pick | Restore anything automatically, or submit forms |
| Offer copy-only recovery when a field can't be matched confidently | Guess which field a saved value belongs to |
| Survive refreshes, tab closure, browser restarts and crashes after a save | Guarantee the last second of typing before a crash |
