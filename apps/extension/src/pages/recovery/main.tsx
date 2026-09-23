import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ApplyOutcome, FieldValue } from "@form-rescue/core";
import { call, CopyButton, Header, ValueView, valueToText } from "../../ui/common.js";
import { exactTime, relativeTime, t, type StringKey } from "../../ui/strings.js";
import "../../ui/styles.css";

const tabId = Number(new URLSearchParams(location.search).get("tab"));

interface Candidate {
  id: string;
  updatedAt: number;
  status: string;
  fieldKinds: FieldValue["kind"][];
  fieldCount: number;
}
interface Item {
  fieldKey: string;
  kind: FieldValue["kind"];
  label: string;
  saved: FieldValue;
  status: "direct" | "manual";
  reason?: string;
  current?: FieldValue;
  currentLabel?: string;
}
interface PageFieldRow {
  ref: number;
  kind: string;
  label: string;
  search: boolean;
  excluded: boolean;
  included: boolean;
}

const ERRORS: Record<string, StringKey> = {
  "no-script": "recNoScript",
  navigated: "recNavigated",
  "stale-plan": "recStale",
  "route-mismatch": "recNavigated",
  "not-found": "recStale",
  "not-enabled": "recNoScript",
};

function isEmpty(v?: FieldValue): boolean {
  if (!v) return true;
  return v.kind === "text"
    ? v.text === ""
    : v.kind === "select"
      ? v.values.every((x) => x === "")
      : v.kind === "checkbox"
        ? !v.checked
        : v.selectedOptionKey === null;
}

function FieldsManager() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ planId: string; fields: PageFieldRow[] } | null>(null);
  const [err, setErr] = useState("");
  const load = async () => {
    const r = await call<{ planId: string; fields: PageFieldRow[] }>({ type: "pageFields", tabId });
    if (r.ok) setData(r);
    else setErr(t(ERRORS[r.error ?? ""] ?? "recStale"));
  };
  return (
    <section className="card stack" aria-labelledby="fields-h" style={{ marginTop: 40 }}>
      <h2 id="fields-h">{t("recFieldsTitle")}</h2>
      <p className="muted">{t("recFieldsLead")}</p>
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          if (!open) void load();
        }}
      >
        {t("recShowFields")}
      </button>
      {err && <p className="notice notice-error">{err}</p>}
      {open && data && (
        <ul className="list">
          {data.fields.map((f) => (
            <li key={f.ref} className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span dir="auto" style={{ overflowWrap: "anywhere" }}>
                {f.label}
              </span>
              {f.excluded ? (
                <span className="pill">{t("recExcluded")}</span>
              ) : f.search && f.included ? (
                <span className="pill pill-ok">{t("recSearchIncluded")}</span>
              ) : f.search ? (
                <button
                  type="button"
                  className="btn"
                  onClick={async () => (await call({ type: "setFieldRule", planId: data.planId, ref: f.ref, mode: "include-search" })).ok && load()}
                >
                  {t("recIncludeSearch")}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={async () => (await call({ type: "setFieldRule", planId: data.planId, ref: f.ref, mode: "exclude" })).ok && load()}
                >
                  {t("recExclude")}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Recovery() {
  const [cands, setCands] = useState<{ hostname: string; candidates: Candidate[]; sameOriginOther: number; liveScript: boolean } | null>(null);
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<string>("");
  const [plan, setPlan] = useState<{ planId: string; savedAt: number; items: Item[] } | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<string>("");
  const [undoText, setUndoText] = useState("");
  const [busy, setBusy] = useState(false);
  const resultRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    void call<{ hostname: string; candidates: Candidate[]; sameOriginOther: number; liveScript: boolean }>({ type: "recoveryCandidates", tabId }).then((r) => {
      if (!r.ok) return setError(t(ERRORS[r.error ?? ""] ?? "recNoScript"));
      setCands(r);
      if (r.candidates[0]) setChosen(r.candidates[0].id);
    });
  }, []);

  const review = async () => {
    setError("");
    setResult("");
    const r = await call<{ planId: string; savedAt: number; items: Item[] }>({ type: "planRestore", tabId, draftId: chosen });
    if (!r.ok) return setError(t(ERRORS[r.error ?? ""] ?? "recStale"));
    setPlan(r);
    // Empty text targets with a confident match may be preselected; everything else starts unchecked.
    setSelected(Object.fromEntries(r.items.map((i) => [i.fieldKey, i.status === "direct" && i.kind === "text" && isEmpty(i.current)])));
  };

  const restore = async () => {
    if (!plan) return;
    setBusy(true);
    const selections = plan.items.filter((i) => selected[i.fieldKey]).map((i) => ({ fieldKey: i.fieldKey, replace: !isEmpty(i.current) }));
    const r = await call<{ outcomes: { fieldKey: string; outcome: ApplyOutcome }[] }>({ type: "restore", planId: plan.planId, selections });
    setBusy(false);
    if (!r.ok) return setError(t(ERRORS[r.error ?? ""] ?? "recStale"));
    const count = (o: ApplyOutcome) => r.outcomes.filter((x) => x.outcome === o).length;
    setResult(
      t("recResult", {
        restored: count("restored"),
        skipped: count("skipped"),
        conflict: count("conflict"),
        unsupported: count("unsupported"),
        failed: count("failed"),
      }),
    );
  };

  // Move focus to the outcome once it is rendered so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (result) resultRef.current?.focus();
  }, [result]);

  const undo = async () => {
    if (!plan) return;
    const r = await call<{ reverted: number; kept: number }>({ type: "undoRestore", planId: plan.planId });
    setUndoText(r.ok ? t("recUndone", { reverted: r.reverted, kept: r.kept }) : t("recStale"));
  };

  return (
    <div className="page">
      <Header title={t("recTitle", { host: cands?.hostname ?? "" })} />
      <main>
        <h2 style={{ fontSize: "1.75rem", overflowWrap: "anywhere" }}>{t("recTitle", { host: cands?.hostname ?? "" })}</h2>
        {error && (
          <p className="notice notice-error" role="alert">
            {error}
          </p>
        )}
        {cands && cands.candidates.length === 0 && <p className="card">{t("recNone")}</p>}
        {cands && cands.sameOriginOther > 0 && <p className="muted">{t("recOtherRoutes", { count: cands.sameOriginOther })}</p>}

        {cands && cands.candidates.length > 0 && !plan && (
          <fieldset className="card stack" style={{ border: "1px solid var(--fr-border)" }}>
            <legend style={{ fontWeight: 700, padding: "0 8px" }}>{t("recChoose")}</legend>
            {cands.candidates.map((c) => (
              <label key={c.id} className="check">
                <input type="radio" name="draft" value={c.id} checked={chosen === c.id} onChange={() => setChosen(c.id)} />
                <span>
                  <time dateTime={new Date(c.updatedAt).toISOString()}>{t("recSavedAt", { when: exactTime(c.updatedAt) })}</time> ({relativeTime(c.updatedAt)})
                  · {t("libFields", { count: c.fieldCount })}
                  {c.status === "submission-attempted" && <span className="muted"> · {t("libSubmitted")}</span>}
                </span>
              </label>
            ))}
            <button type="button" className="btn btn-primary" onClick={() => void review()} disabled={!chosen}>
              {t("recUse")}
            </button>
          </fieldset>
        )}

        {plan && (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              void restore();
            }}
          >
            <p className="notice notice-warn">
              <strong>{t("recWarning")}</strong> {t("recAccount")}
            </p>
            <p className="muted">{t("recSavedAt", { when: exactTime(plan.savedAt) })}</p>
            <ul className="list">
              {plan.items.map((i) => {
                const populated = !isEmpty(i.current);
                return (
                  <li key={i.fieldKey} className="card stack">
                    <h3 dir="auto">
                      {i.label}
                      {i.currentLabel ? <span className="muted"> — {i.currentLabel}</span> : null}
                    </h3>
                    <div className="compare">
                      <div>
                        <h4>{t("recSaved")}</h4>
                        <div className="value-box">
                          <ValueView value={i.saved} />
                        </div>
                      </div>
                      {i.status === "direct" && (
                        <div>
                          <h4>{t("recCurrent")}</h4>
                          <div className="value-box">{i.current ? <ValueView value={i.current} /> : null}</div>
                        </div>
                      )}
                    </div>
                    {i.status === "direct" ? (
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={!!selected[i.fieldKey]}
                          onChange={(e) => setSelected({ ...selected, [i.fieldKey]: e.target.checked })}
                        />
                        <span>{populated ? t("recReplace") : t("recSelect", { label: i.label })}</span>
                      </label>
                    ) : (
                      <div className="stack">
                        <p className="small">
                          {t("recManual")} {t(`reason_${(i.reason ?? "no-match").replace(/-/g, "_")}` as StringKey)}
                        </p>
                        <CopyButton text={valueToText(i.saved)} label={`${t("libCopy")} ${i.label}`} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="btn-row">
              <button type="submit" className="btn btn-primary" disabled={busy || !Object.values(selected).some(Boolean)}>
                {t("recRestore")}
              </button>
              <button type="button" className="btn" onClick={() => setPlan(null)}>
                {t("recBack")}
              </button>
            </div>
            {result && (
              <div className="notice notice-ok stack">
                <p ref={resultRef} tabIndex={-1} role="status">
                  {result}
                </p>
                <p className="small">{t("recConflictHelp")}</p>
                <button type="button" className="btn" onClick={() => void undo()}>
                  {t("recUndo")}
                </button>
                {undoText && <p role="status">{undoText}</p>}
              </div>
            )}
          </form>
        )}
        {cands && <FieldsManager />}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Recovery />
  </StrictMode>,
);
