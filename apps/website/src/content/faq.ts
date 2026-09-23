/** FAQ answers reflect the implemented v0.1 behavior (see docs/PRD.md §9.6). */
export const faq: { q: string; a: string }[] = [
  {
    q: "What is saved?",
    a: "Text you type into ordinary text boxes and text areas, plus choices in non-sensitive dropdowns, checkboxes and radio groups — only fields you actually edited, only on sites you enabled. Form Rescue saves about a second after you pause and keeps the latest three versions of each draft.",
  },
  {
    q: "Which sites are protected?",
    a: "Only the sites you turn on, one at a time, from the toolbar button. Protection covers exactly that scheme, host name and port. Nothing is protected by default, and you can see and remove every protected site in Settings.",
  },
  {
    q: "Are passwords saved?",
    a: "No. Password, one-time-code, payment, bank and identity fields are excluded, and so is any whole form that contains them. Email, phone, number, date and similar inputs are excluded too. These checks run on the field's type and labels before its value is read.",
  },
  {
    q: "Can sensitive prose still be stored?",
    a: "Yes, it can. If you type something private into an ordinary message box, Form Rescue has no reliable way to know. It screens values for obvious secrets such as private keys, access tokens and card numbers, but that is a heuristic. Leave protection off for sites where you write highly sensitive text, or exclude that field.",
  },
  {
    q: "Where are drafts stored?",
    a: "In this browser profile only, inside the extension's own storage, which websites cannot read. There is no account, no server and no sync.",
  },
  {
    q: "Are they encrypted?",
    a: "Not by Form Rescue. Drafts rely on your browser's and operating system's protections. Anyone who can use this browser profile, or read its files, can read the drafts.",
  },
  {
    q: "How long are drafts kept?",
    a: "Seven days after your last edit by default. You can choose 1, 7 or 30 days. Shortening the period deletes older drafts immediately. Expired drafts are removed the next time the extension runs; this is not forensic secure erasure.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. Saving, reviewing and restoring all happen locally and never need a network connection.",
  },
  {
    q: "What happens after I submit a form?",
    a: "Form Rescue can't tell whether a submission succeeded, so it keeps the draft, marks it as a submission attempt, and lets you delete it. Otherwise it expires normally.",
  },
  {
    q: "Can it restore a login session?",
    a: "No. It never saves or restores sign-in details. After a session expires, sign in as usual, go back to the form, and restore your text from Review drafts.",
  },
  {
    q: "What if a website changes?",
    a: "Form Rescue matches fields conservatively. If a form was redesigned or a field can't be identified with confidence, it won't guess — you can still copy the saved text from the review page or the draft library.",
  },
  {
    q: "Does it work in private browsing?",
    a: "No. Form Rescue does not run in private or incognito windows.",
  },
  {
    q: "What happens if I uninstall?",
    a: "Your browser deletes the extension's storage, including every draft. Clearing browser data or losing the profile or device also removes them. Form Rescue is not a backup.",
  },
  {
    q: "Why does it need site permission?",
    a: "To read what you type on a page, a browser extension must be allowed to run there. Form Rescue asks for one site at a time, only when you click “Enable protection for this site”, so it never has access to sites you didn't choose.",
  },
  {
    q: "Can I recover an attachment?",
    a: "No. File uploads, images, rich-text formatting, embedded frames and canvas-based editors are not saved.",
  },
  {
    q: "Why is my last sentence missing?",
    a: "Drafts are committed about a second after you stop typing. If the tab crashes, the computer loses power, or the browser is closed before that, the newest words may not have been saved yet. The popup only says “Saved” after a save has actually completed.",
  },
  {
    q: "Can a shared-computer user see my drafts?",
    a: "Yes, if they can use your browser profile. Use a separate operating-system account or browser profile, lower the retention period, or delete drafts when you finish.",
  },
  {
    q: "Is there telemetry?",
    a: "No. The extension has no analytics, crash reporting, remote configuration or tracking of any kind. The optional diagnostic summary is shown to you first and only leaves your computer if you paste it somewhere yourself. This website's host may keep ordinary access logs.",
  },
  {
    q: "How can I build it myself?",
    a: "The source is MIT-licensed. With Node.js 24 and pnpm, run pnpm install and pnpm build to produce the Chrome/Edge and Firefox builds. The contributing guide has the details.",
  },
];
