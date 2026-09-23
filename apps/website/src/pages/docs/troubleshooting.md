---
layout: ../../layouts/Doc.astro
title: Troubleshooting
description: Fixes for common Form Rescue problems and how to report issues without sharing private data.
---

## The popup says "Reload this page to start protection"

Form Rescue starts on a page when it loads. Pages that were already open before you enabled the site (or before the browser restarted) need a reload.

## Nothing is saved

- Check that the popup says **Protection on** and that saving isn't paused.
- The field may be excluded: password, email, phone, number and date fields, search boxes (unless opted in), fields in forms with password or payment fields, and fields marked `autocomplete="off"` aren't saved. **Review drafts → Manage fields on this page** lists the fields Form Rescue can save.
- Rich-text editors, iframes and private windows aren't supported.

## "Saved" never appears

The popup only reports "Saved" after the draft is stored. If it says **Couldn't save**:

- _Storage is full_ — delete old drafts in **All drafts** or **Settings**.
- _A field is too large_ — values over 64 KiB are skipped, not shortened.
- _Site access was removed_ — enable the site again.

## My last sentence is missing

Drafts are stored about a second after you pause. Text typed in the final moments before a crash, power loss or forced close may not have been saved.

## The review says "Copy only"

The field couldn't be matched to exactly one field on the page with confidence — for example, the form changed or has identical fields. Use **Copy** and paste it yourself.

## "The page changed since you opened this review"

The page navigated (or a single-page app changed route) after you opened the review. Nothing was restored. Open **Review drafts** again.

## A restored field went back to empty

Some sites' code resets fields they didn't expect. Form Rescue reports these as _failed_; copy the text instead.

## Drafts disappeared

Drafts expire after the retention period (7 days by default). Disabling a site with "delete", removing the site's access in browser settings, clearing browser data or uninstalling also deletes them. Firefox temporary (developer) installs lose their storage when Firefox restarts.

## Reporting a problem

Please use the project's GitHub issue forms. **Don't include passwords, real drafts, private URLs, tokens or browser profile exports.** A minimal synthetic HTML page that reproduces the problem is the most useful thing you can share.

**Settings → Diagnostic summary** shows a short text you can paste into an issue. It contains the extension version, browser and version, counts and error codes — no sites, addresses, labels or draft text — and you see all of it before copying.

Security problems should be reported privately; see `SECURITY.md` in the repository. Please don't post vulnerability details in public issues.

## Accessibility feedback

If something in Form Rescue or this site is hard to use with a keyboard, screen reader, zoom or high-contrast mode, please open an issue describing the page, your browser and assistive technology. Accessibility problems are treated as bugs.
