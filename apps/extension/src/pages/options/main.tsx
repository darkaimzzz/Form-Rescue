import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { call, CopyButton, Dialog, Header } from "../../ui/common.js";
import { t } from "../../ui/strings.js";
import "../../ui/styles.css";

interface Settings {
  retentionDays: 1 | 7 | 30;
  paused: boolean;
  sites: { origin: string; hostname: string; permission: boolean }[];
  stats: { drafts: number; bytes: number; sites: number };
  dbError: string | null;
}

function Options() {
  const [s, setS] = useState<Settings | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [disableFor, setDisableFor] = useState<Settings["sites"][number] | null>(null);
  const [message, setMessage] = useState("");
  const [diag, setDiag] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await call<Settings>({ type: "getSettings" });
    if (r.ok) setS(r);
  }, []);
  useEffect(() => void load(), [load]);

  if (!s) return <div className="page" aria-busy="true" />;

  return (
    <div className="page">
      <Header title={t("setTitle")} />
      <main className="stack">
        <h2 style={{ fontSize: "1.75rem" }}>{t("setTitle")}</h2>
        {s.dbError && <p className="notice notice-error">{t("setDbError", { code: s.dbError })}</p>}
        <p role="status" className={message ? "notice notice-ok" : "visually-hidden"}>
          {message}
        </p>

        <section className="card stack" aria-labelledby="cap">
          <h3 id="cap">{t("setCapture")}</h3>
          <label className="check">
            <input
              type="checkbox"
              checked={s.paused}
              onChange={async (e) => {
                await call({ type: "setPaused", paused: e.target.checked });
                await load();
              }}
            />
            <span>{t("setPaused")}</span>
          </label>
          <label>
            {t("setRetention")}{" "}
            <select
              value={s.retentionDays}
              onChange={async (e) => {
                await call({ type: "setRetention", days: Number(e.target.value) as 1 | 7 | 30 });
                await load();
              }}
            >
              {[1, 7, 30].map((d) => (
                <option key={d} value={d}>
                  {t("setRetentionDays", { count: d })}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">{t("setRetentionNote")}</p>
        </section>

        <section className="card stack" aria-labelledby="sites">
          <h3 id="sites">{t("setSites")}</h3>
          {s.sites.length === 0 ? (
            <p className="muted">{t("setNoSites")}</p>
          ) : (
            <ul className="list">
              {s.sites.map((site) => (
                <li key={site.origin} className="btn-row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ overflowWrap: "anywhere" }}>{site.hostname}</span>
                  <button type="button" className="btn btn-danger" onClick={() => setDisableFor(site)}>
                    {t("disableSite")}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">{t("setRevocationNote")}</p>
        </section>

        <section className="card stack" aria-labelledby="storage">
          <h3 id="storage">{t("setStorage")}</h3>
          <p>{t("setStats", { drafts: s.stats.drafts, sites: s.stats.sites, kib: Math.ceil(s.stats.bytes / 1024) })}</p>
          <button type="button" className="btn btn-danger" onClick={() => setConfirmAll(true)} disabled={s.stats.drafts === 0}>
            {t("setDeleteAll")}
          </button>
        </section>

        <section className="card stack" aria-labelledby="privacy-h" id="privacy">
          <h3 id="privacy-h">{t("setPrivacyTitle")}</h3>
          <p>{t("setPrivacy")}</p>
        </section>

        <section className="card stack" aria-labelledby="diag">
          <h3 id="diag">{t("setDiagnostics")}</h3>
          <p className="muted">{t("setDiagnosticsLead")}</p>
          {diag === null ? (
            <button type="button" className="btn" onClick={async () => setDiag((await call<{ text: string }>({ type: "diagnostics" })).text ?? "")}>
              {t("setDiagnosticsShow")}
            </button>
          ) : (
            <>
              <pre className="value-box" style={{ fontFamily: "var(--fr-mono)", whiteSpace: "pre-wrap" }}>
                {diag}
              </pre>
              <CopyButton text={diag} label={t("setDiagnosticsCopy")} />
            </>
          )}
        </section>
      </main>

      <Dialog open={confirmAll} onClose={() => setConfirmAll(false)} title={t("setDeleteAllConfirm", { count: s.stats.drafts })}>
        <p>{t("setDeleteAllBody")}</p>
        <div className="btn-row">
          <button
            type="button"
            className="btn btn-danger-solid"
            onClick={async () => {
              const r = await call<{ remaining: number }>({ type: "deleteAll" });
              setConfirmAll(false);
              setMessage(r.ok ? t("setDeleteAllDone") : t("setDeleteAllFailed"));
              await load();
            }}
          >
            {t("setDeleteAll")}
          </button>
          <button type="button" className="btn" autoFocus onClick={() => setConfirmAll(false)}>
            {t("cancel")}
          </button>
        </div>
      </Dialog>

      <Dialog open={disableFor !== null} onClose={() => setDisableFor(null)} title={t("disableTitle", { host: disableFor?.hostname ?? "" })}>
        <p>{t("disableBody")}</p>
        <div className="stack">
          {[false, true].map((keep) => (
            <button
              key={String(keep)}
              type="button"
              className={keep ? "btn" : "btn btn-danger-solid"}
              autoFocus={!keep}
              onClick={async () => {
                if (!disableFor) return;
                await call({ type: "disableSite", origin: disableFor.origin, keepDrafts: keep });
                setDisableFor(null);
                await load();
              }}
            >
              {keep ? t("disableKeep") : t("disableDelete")}
            </button>
          ))}
          <p className="muted small">{t("disableKeepNote")}</p>
          <button type="button" className="btn btn-quiet" onClick={() => setDisableFor(null)}>
            {t("cancel")}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
