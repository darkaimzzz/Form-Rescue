import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FieldValue, UiMessage } from "@form-rescue/core";
import { ext } from "../platform/browser.js";
import { t } from "./strings.js";

export async function call<T = { ok: boolean; error?: string }>(msg: UiMessage): Promise<T & { ok: boolean; error?: string }> {
  try {
    return (await ext.runtime.sendMessage(msg)) as T & { ok: boolean; error?: string };
  } catch {
    return { ok: false, error: "internal" } as T & { ok: boolean; error?: string };
  }
}

export const pageUrl = (path: string) => ext.runtime.getURL(path);

/** Websites are linked only when configured; see src/ui/links.ts. */
export function openPage(path: string): void {
  void ext.tabs.create({ url: pageUrl(path) });
}

// Bidi overrides/isolates, zero-width and other invisible controls are shown as visible markers.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** Display-only transformation. The stored value is never altered. */
export function displayText(s: string): string {
  return s.replace(INVISIBLE, (c) => `⟦U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}⟧`);
}

/** Plain-text rendering of an untrusted value. Never HTML. */
export function SafeText({ text }: { text: string }) {
  if (text === "") return <span className="muted">{t("recEmpty")}</span>;
  return (
    <span className="value-text" dir="auto">
      {displayText(text)}
    </span>
  );
}

export function valueToText(v: FieldValue): string {
  switch (v.kind) {
    case "text":
      return v.text;
    case "select":
      return v.values.join(", ");
    case "checkbox":
      return v.checked ? t("checked") : t("unchecked");
    case "radio":
      return v.selectedOptionKey ?? t("noSelection");
  }
}

export function ValueView({ value }: { value: FieldValue }) {
  if (value.kind === "text") return <SafeText text={value.text} />;
  return <SafeText text={valueToText(value)} />;
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <span className="copy">
      <button
        type="button"
        className="btn btn-quiet"
        aria-label={label}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? t("libCopied") : t("libCopy")}
      </button>
      {state === "failed" && (
        <span role="status" className="muted small">
          {t("libCopyFailed")}
        </span>
      )}
    </span>
  );
}

/** Native <dialog>: focus containment, Escape to close, and focus return to the opener are provided by the platform. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="dialog-title" onClose={onClose}>
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}

export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="16" fill="var(--fr-accent)" />
      <g fill="none" stroke="var(--fr-on-accent)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 18h32M16 28h18" />
        <path d="M47 28v8a6 6 0 0 1-6 6H18" />
        <path d="M25 35l-7 7 7 7" />
      </g>
    </svg>
  );
}

export function Header({ title }: { title: string }) {
  return (
    <header className="page-header">
      <Mark />
      <span className="brand">{t("appName")}</span>
      <nav aria-label="Extension pages" className="page-nav">
        <a href={pageUrl("pages/library/index.html")}>{t("allDrafts")}</a>
        <a href={pageUrl("pages/options/index.html")}>{t("settings")}</a>
      </nav>
      <h1 className="visually-hidden">{title}</h1>
    </header>
  );
}
