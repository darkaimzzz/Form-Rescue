---
layout: ../../layouts/Doc.astro
title: Recovering drafts
description: How to review saved drafts, restore selected fields, handle conflicts, copy text and undo a restore.
---

## When a draft is available

On a protected page, the toolbar badge shows how many saved drafts match the page. Open the popup and choose **Review drafts**. The badge never contains draft text.

A draft matches the page only when the **origin** (scheme, host name, port) and the **full address** (path, query and fragment) are the same. Drafts from other pages of the same site are in **All drafts**, where you can copy them.

## Reviewing

The review page belongs to the extension; the website can't see it.

1. **Choose one draft.** If you worked on the same form in two tabs, each tab has its own draft. They're never merged.
2. **Compare.** Each saved field is shown next to what's on the page now.
3. **Select.** Empty fields with a confident match start selected. Fields that already contain something — and every dropdown, checkbox and radio group — start unselected. For a field that has content, the option reads **Replace what's on the page**.
4. **Restore selected fields.** Restoring makes these values available to the website.

Form Rescue then reports how many fields were restored, skipped, conflicted, unsupported or failed.

## Conflicts and safety checks

Just before restoring, Form Rescue checks again that the page is the same one you reviewed, that it's still enabled, and that each target field still holds the value you saw. If anything changed:

- **The page navigated** (including single-page-app route changes): nothing is restored. Start the review again.
- **A field changed after you reviewed it:** that field is skipped as a *conflict* and left alone.
- **The site's code rejects the value** (some frameworks reset fields): the field is reported as *failed*. Use copy instead.

## Copy-only fields

If a saved field can't be matched to exactly one field on the page with confidence — for example, two identical answer boxes, a changed list of options, or a redesigned form — Form Rescue won't guess. It shows the saved value with a **Copy** button.

## Undo

After restoring, **Undo this restore** puts back what was in each field before, as long as you haven't edited that field since. Undo works only while the page stays open.

## After an expired sign-in

Form Rescue never saves or restores sign-in details. Sign in the usual way, go back to the form, and use **Review drafts**. If you use more than one account on the site, check you're signed in to the right one — Form Rescue can't tell accounts apart.

## After submitting

Form Rescue can't know whether a submission succeeded. It keeps the draft, labels it "Submission attempted", and lets you delete it.
