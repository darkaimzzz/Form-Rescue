# Accessibility

Target: WCAG 2.2 AA for extension UI and website. Automated checks are necessary, not sufficient.

## Automated (passing)

`pnpm test:a11y` (`tests/accessibility/`):

- axe-core with WCAG 2.0/2.1/2.2 A and AA tags on: popup (not enabled, saved, disable dialog), recovery (choose, plan, result), library (expanded), settings (and delete dialog), onboarding (light, dark + reduced motion, forced colors); every website route in light and dark; every demo state; the open mobile menu.
- Keyboard: popup primary action reachable by Tab; disable dialog opens with Enter, closes with Escape and returns focus to its opener; focus moves to the restore result; demo operable by keyboard with focus management; mobile menu opens by keyboard, Escape closes and returns focus.
- Reflow: no horizontal scrolling at 320 px (extension pages) and at 320/375/768/1024/1440 px (website); website at 200% root font size.
- Bidi/control characters in saved values are shown as visible `⟦U+XXXX⟧` markers.
- Lighthouse accessibility median 0.98–1.00 on four website pages.

## Design measures

44×44 px targets; visible 3 px focus outline; saved/current values labelled in text, not colour; restrained live regions (popup status, restore result, demo steps), nothing announces per keystroke; native `<dialog>` for focus containment; skip link and landmarks on the website; one `h1` per page; centralized strings with ICU-style plurals.

## Contrast (light tokens)

ink `#151A23` on base `#F7F8FA` ≈ 16.9:1; muted `#586170` on base ≈ 5.9:1; white on accent `#006B5B` ≈ 6.6:1. Dark tokens pass axe's contrast checks. Syntax highlighting was removed from website code blocks because the theme failed contrast.

## Not yet done (tracked)

Manual screen-reader passes with NVDA (Windows) and VoiceOver (macOS); 400% browser zoom walkthrough; Windows High Contrast with real themes. Recorded as unverified in `docs/implementation-status.md`.
