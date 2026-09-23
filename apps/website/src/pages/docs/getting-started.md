---
layout: ../../layouts/Doc.astro
title: Getting started
description: Install the Form Rescue developer build in Chrome, Edge or Firefox and protect your first site.
---

Form Rescue isn't distributed through the browser stores. You install the developer build yourself — it takes about a minute.

## Three steps

1. **Enable a site.** Open a site where you write long text, click the Form Rescue toolbar button, and choose **Enable protection for this site**. Your browser asks to allow access to that site only.
2. **Write as usual.** About a second after you pause, the popup shows **Saved locally at …**. It only says "Saved" once the draft is actually stored.
3. **Review and recover.** After a refresh, a closed tab or a sign-in, return to the page, open Form Rescue, and choose **Review drafts**.

## Developer build

You need the built extension folder.

**Download (easiest):** get `form-rescue-<version>-chrome.zip` (Chrome and Edge) or `form-rescue-<version>-firefox.zip` from the [latest GitHub release](https://github.com/darkaimzzz/Form-Rescue/releases/latest) and unzip it into a folder you'll keep.

**Or build from source** (Node.js 24 and pnpm; see [Contributing](/docs/contributing/)):

```sh
pnpm install --frozen-lockfile
pnpm build
```

This produces `apps/extension/dist/chrome` (Chrome and Edge) and `apps/extension/dist/firefox`. Below, "the folder" means the unzipped download or one of these.

### Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the Chrome folder.
4. Pin Form Rescue from the puzzle-piece menu so the toolbar button is easy to reach.

### Edge

1. Open `edge://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose the Chrome folder (Edge uses the same build).

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and choose `manifest.json` in the Firefox folder.
3. In the Extensions menu, allow Form Rescue on a site when you enable it.

**Development installs are temporary in Firefox:** they are removed when Firefox restarts, and the browser deletes their storage, including drafts. In Chrome and Edge an unpacked extension stays installed, but moving or deleting its folder breaks it.

## Try it on a practice page

Once the public site is live, the [practice form](/try/) is a safe place to test. From the source repository you can also run `pnpm fixtures` and open `http://127.0.0.1:4173/demo.html`, a synthetic support form used by the automated tests.

## Private windows

Form Rescue does not run in private or incognito windows.
