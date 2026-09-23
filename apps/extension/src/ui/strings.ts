/**
 * English string catalog. All user-visible extension text lives here so it
 * can be translated; strings use named {placeholders}, never concatenation.
 */
export const en = {
  appName: "Form Rescue",
  tagline: "Get your words back.",

  // popup
  popupUnsupported: "Form Rescue can't run on this page. It works on ordinary http and https pages, not browser pages, store pages, or private windows.",
  popupNotEnabled: "Not enabled",
  popupEnable: "Enable protection for this site",
  popupEnableHint: "Your browser will ask to allow access to {host} only.",
  popupDenied: "Access wasn't granted, so this site stays unprotected. You can try again whenever you like.",
  popupRetry: "Try again",
  popupOnNoEdits: "Protection on — saving starts when you edit a supported field.",
  stateReady: "Ready",
  stateSaving: "Saving…",
  stateSaved: "Saved locally at {time}",
  statePaused: "Paused",
  stateUnsupported: "Unsupported page",
  stateError: "Couldn't save",
  stateNoScript: "Reload this page to start protection.",
  noEditsYet: "No eligible edits yet",
  errorQuota: "Storage is full. Delete old drafts to keep saving.",
  errorTooLarge: "A field is too large to save (over 64 KiB). It was skipped, not shortened.",
  errorRevoked: "Site access was removed, so saving stopped.",
  errorStale: "Drafts changed elsewhere. Saving restarts on your next edit.",
  errorStorage: "Something went wrong while saving. Your earlier saved draft is unaffected.",
  warnFieldsSkipped: "Some fields weren't saved because a draft can hold at most 100 fields.",
  draftsForPage: "{count, plural, =0 {No saved drafts for this page} one {1 saved draft for this page} other {# saved drafts for this page}}",
  reviewDrafts: "Review drafts",
  pauseAll: "Pause saving everywhere",
  resumeAll: "Resume saving",
  pausedBanner: "Saving is paused on all sites. Existing drafts stay until they expire.",
  disableSite: "Disable this site",
  allDrafts: "All drafts",
  settings: "Settings",
  privacy: "Privacy",
  help: "Help",
  protectionOn: "Protection on",
  retryDelete: "Delete old drafts",

  // disable dialog
  disableTitle: "Disable {host}?",
  disableBody: "Saving stops on this site now. What should happen to its saved drafts?",
  disableDelete: "Disable and delete drafts",
  disableKeep: "Disable and keep drafts",
  disableKeepNote: "Kept drafts stay in this browser profile until they expire.",
  cancel: "Cancel",

  // onboarding
  onbTitle: "Your drafts stay in this browser profile.",
  onbLead: "Form Rescue saves what you type on the sites you choose, so you can get it back after a refresh, a closed tab, or an expired sign-in.",
  onbPoint1Title: "Sensitive fields are skipped",
  onbPoint1: "Passwords, one-time codes, payment and identity fields, and forms that contain them are never saved. Detection is careful but not perfect — avoid enabling sites where you type highly sensitive prose.",
  onbPoint2Title: "Drafts expire after seven days",
  onbPoint2: "You can choose 1, 7, or 30 days in settings. Nothing is kept forever, and nothing leaves your device.",
  onbPoint3Title: "The last few seconds can be lost",
  onbPoint3: "Drafts are saved about a second after you stop typing. If the browser crashes or the power fails before that, the newest words may not be recoverable.",
  onbTryDemo: "Try the demo",
  onbEnable: "Enable on a site",
  onbEnableHow: "Open the site you want to protect, click the Form Rescue toolbar button, then choose “Enable protection for this site.”",
  onbDemoLocal: "The public practice page isn't published yet. Developers can run “pnpm fixtures” in the source repository and open http://127.0.0.1:4173/demo.html.",
  onbDemoReadme: "Read the README.",

  // library
  libTitle: "Saved drafts",
  libEmpty: "No saved drafts. Drafts appear here after you edit a supported field on a protected site.",
  libFilterHost: "Site",
  libFilterAll: "All sites",
  libFilterTime: "Edited",
  libTimeAny: "Any time",
  libTimeDay: "Last 24 hours",
  libTimeWeek: "Last 7 days",
  libForm: "Form {letter}",
  libFields: "{count, plural, one {1 field} other {# fields}}",
  libExpires: "Expires {when}",
  libEdited: "Edited {when}",
  libShow: "Show values",
  libHide: "Hide values",
  libCopy: "Copy",
  libCopied: "Copied",
  libCopyFailed: "Copy isn't available here. Select the text and copy it manually.",
  libDelete: "Delete draft",
  libDeleteSite: "Delete all drafts for {host}",
  libSubmitted: "Submission attempted — the draft is kept until it expires or you delete it.",
  libDeletedDraft: "Draft deleted.",
  libDeletedSite: "{count, plural, one {Deleted 1 draft.} other {Deleted # drafts.}}",
  libNoUrls: "Form Rescue doesn't keep page addresses, so it can't open the original page for you. Revisit the site yourself to restore into the form.",

  // recovery
  recTitle: "Review drafts for {host}",
  recNone: "No saved drafts match this page. Drafts from other pages of this site are in All drafts, where you can copy them.",
  recOtherRoutes: "{count, plural, one {1 draft from another page of this site is in All drafts.} other {# drafts from other pages of this site are in All drafts.}}",
  recChoose: "Choose one draft",
  recSavedAt: "Saved {when}",
  recUse: "Review this draft",
  recWarning: "Restoring makes these values available to this website.",
  recAccount: "If you use more than one account on this site, make sure you're signed in to the right one. Form Rescue can't tell accounts apart.",
  recSaved: "Saved",
  recCurrent: "On the page now",
  recEmpty: "(empty)",
  recReplace: "Replace what's on the page",
  recSelect: "Restore {label}",
  recManual: "Copy only — this field can't be matched to the page with confidence.",
  recRestore: "Restore selected fields",
  recResult: "Restored {restored}, skipped {skipped}, conflicted {conflict}, unsupported {unsupported}, failed {failed}.",
  recConflictHelp: "Conflicted fields changed after you reviewed them and were left alone.",
  recUndo: "Undo this restore",
  recUndone: "Undo finished: {reverted} reverted, {kept} kept because you edited them afterwards.",
  recNoScript: "Form Rescue isn't active on this tab yet. Reload the page, then open Review drafts again.",
  recNavigated: "The page changed since you opened this review. Nothing was restored. Start the review again.",
  recStale: "This review is out of date. Nothing was restored. Start the review again.",
  recBack: "Choose a different draft",
  recFieldsTitle: "Fields on this page",
  recFieldsLead: "Exclude a field to stop saving it and delete its saved values. If the page is redesigned, a rule may stop matching.",
  recExclude: "Exclude this field",
  recExcluded: "Excluded",
  recIncludeSearch: "Save this search box",
  recSearchIncluded: "Saving this search box",
  recShowFields: "Manage fields on this page",
  checked: "Checked",
  unchecked: "Not checked",
  noSelection: "Nothing selected",

  reason_weak_identity: "The field's identity is too weak to match automatically.",
  reason_ambiguous: "More than one field on the page could match.",
  reason_duplicate_target: "Two saved fields point at the same field on the page.",
  reason_kind_or_options_changed: "The field's type or options changed.",
  reason_form_changed: "The form on the page looks different from when this was saved.",
  reason_no_match: "No matching field was found on this page.",

  // settings
  setTitle: "Settings",
  setCapture: "Saving",
  setPaused: "Pause saving on all sites",
  setRetention: "Keep drafts for",
  setRetentionDays: "{count, plural, one {1 day} other {# days}}",
  setRetentionNote: "Drafts expire this long after your last edit. Shortening this deletes older drafts immediately.",
  setSites: "Protected sites",
  setNoSites: "No sites are protected yet.",
  setPermissionMissing: "Access removed — drafts for this site were deleted.",
  setDeleteAll: "Delete all drafts",
  setDeleteAllConfirm: "{count, plural, one {Delete 1 draft permanently?} other {Delete all # drafts permanently?}}",
  setDeleteAllBody: "This can't be undone. Form Rescue keeps no hidden copies.",
  setDeleteAllDone: "All drafts deleted. The library is empty.",
  setDeleteAllFailed: "Some drafts could not be deleted. Try again.",
  setStorage: "Storage",
  setStats: "{drafts} drafts from {sites} protected sites, using {kib} KiB of the 20 MiB budget.",
  setDiagnostics: "Diagnostic summary",
  setDiagnosticsLead: "If you report a problem, you can paste this summary into a GitHub issue. It contains no sites, addresses, labels, or draft text.",
  setDiagnosticsShow: "Show diagnostic summary",
  setDiagnosticsCopy: "Copy summary",
  setPrivacyTitle: "Privacy",
  setPrivacy:
    "Drafts are stored only in this browser profile, in extension storage that websites can't read. Nothing is uploaded and there is no telemetry. Storage is not encrypted by Form Rescue: anyone who can use this browser profile can open your drafts. Uninstalling the extension or clearing browser data deletes them. Deleted data is removed from the extension's database the next time it runs; this isn't forensic secure erasure.",
  setRevocationNote: "If you remove Form Rescue's access to a site from the browser's own settings, its saved drafts are deleted the next time the extension runs.",
  setDbError: "Form Rescue can't open its storage (code: {code}). Saving is stopped and your data is left untouched. Updating the extension or restarting the browser may help.",
  dialogClose: "Close",
} as const;

export type StringKey = keyof typeof en;

/** Minimal ICU-style formatting: {name} and {count, plural, =0 {…} one {…} other {…}} with # for the number. */
export function t(key: StringKey, vars: Record<string, string | number> = {}): string {
  let s: string = en[key];
  s = s.replace(/\{(\w+), plural, ((?:[^{}]|\{[^{}]*\})*)\}/g, (_m, name: string, body: string) => {
    const n = Number(vars[name] ?? 0);
    const forms = Object.fromEntries([...body.matchAll(/(=\d+|zero|one|two|few|many|other)\s*\{([^{}]*)\}/g)].map((m) => [m[1], m[2]]));
    const cat = new Intl.PluralRules("en").select(n);
    const chosen = forms[`=${n}`] ?? forms[cat] ?? forms.other ?? "";
    return chosen.replace(/#/g, new Intl.NumberFormat("en").format(n));
  });
  return s.replace(/\{(\w+)\}/g, (_m, name: string) => String(vars[name] ?? ""));
}

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = ts - now;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  for (const [unit, ms] of units) if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  return rtf.format(0, "second");
}

export function exactTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(ts);
}

export function clockTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(ts);
}
