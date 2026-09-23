import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FieldValue } from "@form-rescue/core";
import { call, CopyButton, Header, ValueView, valueToText } from "../../ui/common.js";
import { exactTime, relativeTime, t } from "../../ui/strings.js";
import "../../ui/styles.css";

interface Summary {
  id: string;
  origin: string;
  hostname: string;
  formLabel: string;
  updatedAt: number;
  expiresAt: number;
  fieldCount: number;
  status: "active" | "submission-attempted";
}
interface Field {
  fieldKey: string;
  kind: FieldValue["kind"];
  label: string;
  value: FieldValue;
  editedAt: number;
}

const TIME_WINDOWS = { any: Infinity, day: 86_400_000, week: 7 * 86_400_000 } as const;

function DraftItem({ d, onDeleted }: { d: Summary; onDeleted: (msg: string) => void }) {
  const [fields, setFields] = useState<Field[] | null>(null);
  const [open, setOpen] = useState(false);
  const panelId = `draft-${d.id}`;
  const toggle = async () => {
    if (!open && !fields) {
      const r = await call<{ fields: Field[] }>({ type: "getDraft", draftId: d.id });
      setFields(r.ok ? r.fields : []);
    }
    setOpen((v) => !v);
  };
  return (
    <li className="card">
      <h3>
        {t("libForm", { letter: d.formLabel })} · <span className="muted">{t("libFields", { count: d.fieldCount })}</span>
      </h3>
      <p className="small">
        <time dateTime={new Date(d.updatedAt).toISOString()} title={exactTime(d.updatedAt)}>
          {t("libEdited", { when: relativeTime(d.updatedAt) })}
        </time>{" "}
        ·{" "}
        <time dateTime={new Date(d.expiresAt).toISOString()} title={exactTime(d.expiresAt)}>
          {t("libExpires", { when: relativeTime(d.expiresAt) })}
        </time>
      </p>
      {d.status === "submission-attempted" && <p className="notice small">{t("libSubmitted")}</p>}
      <div className="btn-row">
        <button type="button" className="btn" aria-expanded={open} aria-controls={panelId} onClick={() => void toggle()}>
          {open ? t("libHide") : t("libShow")}
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            const r = await call({ type: "deleteDraft", draftId: d.id });
            if (r.ok) onDeleted(t("libDeletedDraft"));
          }}
        >
          {t("libDelete")}
        </button>
      </div>
      {open && (
        <ul id={panelId} className="list" style={{ marginTop: 16 }}>
          {(fields ?? []).map((f) => (
            <li key={f.fieldKey}>
              <div className="btn-row" style={{ alignItems: "center", justifyContent: "space-between" }}>
                <strong>{f.label}</strong>
                <CopyButton text={valueToText(f.value)} label={`${t("libCopy")} ${f.label}`} />
              </div>
              <div className="value-box">
                <ValueView value={f.value} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Library() {
  const [drafts, setDrafts] = useState<Summary[] | null>(null);
  const [host, setHost] = useState("all");
  const [win, setWin] = useState<keyof typeof TIME_WINDOWS>("any");
  const [message, setMessage] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    const r = await call<{ drafts: Summary[] }>({ type: "listDrafts" });
    setDrafts(r.ok ? r.drafts : []);
  }, []);
  useEffect(() => void load(), [load]);

  const hosts = useMemo(() => [...new Set((drafts ?? []).map((d) => d.origin))].sort(), [drafts]);
  const filtered = (drafts ?? []).filter((d) => (host === "all" || d.origin === host) && Date.now() - d.updatedAt <= TIME_WINDOWS[win]);
  const groups = new Map<string, Summary[]>();
  for (const d of filtered) groups.set(d.origin, [...(groups.get(d.origin) ?? []), d]);

  const afterDelete = async (msg: string) => {
    setMessage(msg);
    await load();
    headingRef.current?.focus();
  };

  return (
    <div className="page">
      <Header title={t("libTitle")} />
      <main>
        <h2 ref={headingRef} tabIndex={-1} style={{ fontSize: "1.75rem" }}>
          {t("libTitle")}
        </h2>
        <p className="muted">{t("libNoUrls")}</p>
        <p role="status" className={message ? "notice notice-ok" : "visually-hidden"}>
          {message}
        </p>
        <div className="btn-row" style={{ margin: "16px 0 24px" }}>
          <label>
            {t("libFilterHost")}{" "}
            <select value={host} onChange={(e) => setHost(e.target.value)}>
              <option value="all">{t("libFilterAll")}</option>
              {hosts.map((h) => (
                <option key={h} value={h}>
                  {new URL(h).host}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t("libFilterTime")}{" "}
            <select value={win} onChange={(e) => setWin(e.target.value as keyof typeof TIME_WINDOWS)}>
              <option value="any">{t("libTimeAny")}</option>
              <option value="day">{t("libTimeDay")}</option>
              <option value="week">{t("libTimeWeek")}</option>
            </select>
          </label>
        </div>
        {drafts && filtered.length === 0 && <p className="card">{t("libEmpty")}</p>}
        {[...groups].map(([origin, ds]) => (
          <section key={origin} aria-labelledby={`h-${origin}`} style={{ marginBottom: 40 }}>
            <div className="btn-row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 id={`h-${origin}`} style={{ margin: 0, overflowWrap: "anywhere" }}>
                {ds[0]!.hostname}
              </h2>
              <button
                type="button"
                className="btn btn-danger"
                onClick={async () => {
                  const r = await call<{ removed: number }>({ type: "deleteSite", origin });
                  if (r.ok) await afterDelete(t("libDeletedSite", { count: r.removed }));
                }}
              >
                {t("libDeleteSite", { host: ds[0]!.hostname })}
              </button>
            </div>
            <ul className="list">
              {ds.map((d) => (
                <DraftItem key={d.id} d={d} onDeleted={(m) => void afterDelete(m)} />
              ))}
            </ul>
          </section>
        ))}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Library />
  </StrictMode>,
);
