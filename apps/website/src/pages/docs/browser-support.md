---
layout: ../../layouts/Doc.astro
title: Browser support
description: Which browsers and versions Form Rescue has actually been tested on, and known differences.
---

Form Rescue is an alpha. This table lists only what has actually been exercised.

| Browser                     | Version tested | How                                                                                                                      | Status  |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| Chromium (Playwright build) | 153.0.8010.12  | Full automated suite: recovery, privacy, durability incl. crash, scenarios, accessibility, performance                   | Passing |
| Microsoft Edge              | 153.0.4234.48  | Full automated suite with the installed browser                                                                          | Passing |
| Firefox                     | 156.0.1        | Automated smoke over WebDriver BiDi: install, enable, save, reload, review, restore, sensitive-form check, delete all    | Passing |
| Google Chrome (branded)     | 153            | Chrome no longer loads unpacked extensions from the command line, so automation uses Chromium; a manual check is pending | Pending |
| Brave, Opera, Vivaldi       | —              | Not tested                                                                                                               | Unknown |
| Safari, mobile browsers     | —              | Not supported                                                                                                            | —       |

Tested on Windows 11. macOS and Linux runs, and older browser versions, haven't been done yet. The extension declares its minimum as the oldest version actually validated (Chrome/Edge 153, Firefox 156).

## Differences between browsers

- **Background:** Chrome and Edge use a service worker; Firefox uses an event page. Both are stopped when idle; saved drafts don't depend on them staying alive.
- **Firefox developer installs** are temporary and removed (with their storage) when Firefox restarts.
- **Port matching:** both browsers grant site access by host; Form Rescue applies exact scheme + host + port itself.

## What's supported on pages

Native `textarea`, text inputs, opted-in search inputs, non-sensitive `select`, checkboxes and radio groups; forms added after load; common React and Vue forms; open shadow roots; fields outside `<form>` elements.

Not supported: `contenteditable` and rich-text editors, iframes, closed shadow roots, file inputs, canvas editors, PDFs, browser pages, extension store pages, private windows.
