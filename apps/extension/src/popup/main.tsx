import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ext, originPattern } from "../platform/browser.js";
import { call, Dialog, Mark, openPage } from "../ui/common.js";
import { clockTime, t, type StringKey } from "../ui/strings.js";
import "../ui/styles.css";
import "./popup.css";

interface PopupState {
  ok: boolean;
  supported: boolean;
  paused: boolean;
  origin?: string;
  hostname?: string;
  enabled?: boolean;
  permission?: boolean;
  status?: { state: string; savedAt: number | null; error: string | null; warning: string | null } | null;
  candidateCount?: number;
}

const ERROR_TEXT: Record<string, StringKey> = {
  quota: "errorQuota",
  "too-large": "errorTooLarge",
  revoked: "errorRevoked",
  stale: "errorStale",
};

async function targetTabId(): Promise<number | undefined> {
  // Tests and the recovery page may pass an explicit tab; the popup otherwise uses the active tab.
  const param = new URLSearchParams(location.search).get("tab");
  if (param) return Number(param);
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

function Popup() {
  const [tabId, setTabId] = useState<number>();
  const [s, setS] = useState<PopupState | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);

  const refresh = useCallback(async (id: number) => setS(await call<PopupState>({ type: "popupState", tabId: id })), []);

  useEffect(() => {
    void targetTabId().then((id) => {
      if (id === undefined) return setS({ ok: true, supported: false, paused: false });
      setTabId(id);
      void refresh(id);
    });
  }, [refresh]);

  useEffect(() => {
    if (tabId === undefined || !s?.enabled) return;
    const timer = setInterval(() => void refresh(tabId), 1500);
    return () => clearInterval(timer);
  }, [tabId, s?.enabled, refresh]);

  if (!s || tabId === undefined) return <main className="popup" aria-busy="true" />;

  const enable = () => {
    if (!s.origin) return;
    setBusy(true);
    setDenied(false);
    // Must be called directly from the click: requests only this scheme + host.
    // If access was already granted (known before the click), no prompt is needed.
    const request = s.permission ? Promise.resolve(true) : ext.permissions.request({ origins: [originPattern(s.origin)] });
    request.then(async (granted) => {
      if (granted) await call({ type: "enableSite", tabId });
      else setDenied(true);
      setBusy(false);
      await refresh(tabId);
    }, () => {
      setDenied(true);
      setBusy(false);
    });
  };

  const disable = async (keepDrafts: boolean) => {
    if (!s.origin) return;
    setConfirmDisable(false);
    await call({ type: "disableSite", origin: s.origin, keepDrafts });
    await refresh(tabId);
  };

  const togglePause = async () => {
    await call({ type: "setPaused", paused: !s.paused });
    await refresh(tabId);
  };

  let stateText = "";
  let detail = "";
  if (s.supported && s.enabled) {
    const st = s.status;
    if (s.paused) stateText = t("statePaused");
    else if (!st) {
      stateText = t("stateReady");
      detail = t("stateNoScript");
    } else if (st.state === "saving") stateText = t("stateSaving");
    else if (st.state === "error") {
      stateText = t("stateError");
      detail = t(ERROR_TEXT[st.error ?? ""] ?? "errorStorage");
    } else if (st.savedAt) stateText = t("stateSaved", { time: clockTime(st.savedAt) });
    else {
      stateText = t("stateReady");
      detail = t("popupOnNoEdits");
    }
    if (st?.warning === "too-large") detail = t("errorTooLarge");
    if (st?.warning === "fields-skipped") detail = t("warnFieldsSkipped");
  }

  return (
    <main className="popup">
      <div className="popup-head">
        <Mark size={24} />
        <span className="brand">{t("appName")}</span>
      </div>

      {s.paused && (
        <div className="notice notice-warn">
          <p>{t("pausedBanner")}</p>
          <button type="button" className="btn" onClick={togglePause}>
            {t("resumeAll")}
          </button>
        </div>
      )}

      {!s.supported ? (
        <section aria-labelledby="site">
          <h1 id="site" className="site">{t("stateUnsupported")}</h1>
          <p className="muted">{t("popupUnsupported")}</p>
        </section>
      ) : !s.enabled ? (
        <section aria-labelledby="site">
          <h1 id="site" className="site">{s.hostname}</h1>
          <p className="state" role="status">
            {t("popupNotEnabled")}
          </p>
          <button type="button" className="btn btn-primary wide" onClick={enable} disabled={busy}>
            {t("popupEnable")}
          </button>
          <p className="muted small">{t("popupEnableHint", { host: s.hostname ?? "" })}</p>
          {denied && (
            <div className="notice" role="status">
              <p>{t("popupDenied")}</p>
              <button type="button" className="btn" onClick={enable}>
                {t("popupRetry")}
              </button>
            </div>
          )}
        </section>
      ) : (
        <section aria-labelledby="site">
          <h1 id="site" className="site">{s.hostname}</h1>
          <p className="pill pill-ok">{t("protectionOn")}</p>
          <p className="state" role="status" aria-live="polite">
            {stateText}
          </p>
          {detail && <p className={s.status?.state === "error" ? "notice notice-error" : "muted small"}>{detail}</p>}
          {s.status?.error === "quota" && (
            <button type="button" className="btn" onClick={() => openPage("pages/library/index.html")}>
              {t("retryDelete")}
            </button>
          )}
          <p>{t("draftsForPage", { count: s.candidateCount ?? 0 })}</p>
          <button
            type="button"
            className="btn btn-primary wide"
            disabled={!s.candidateCount}
            onClick={() => openPage(`pages/recovery/index.html?tab=${tabId}`)}
          >
            {t("reviewDrafts")}
          </button>
          <div className="btn-row spaced">
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDisable(true)}>
              {t("disableSite")}
            </button>
          </div>
        </section>
      )}

      {!s.paused && (
        <button type="button" className="btn btn-quiet" onClick={togglePause}>
          {t("pauseAll")}
        </button>
      )}

      <nav aria-label="More" className="popup-links">
        <button type="button" className="btn btn-quiet" onClick={() => openPage("pages/library/index.html")}>
          {t("allDrafts")}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => openPage("pages/options/index.html")}>
          {t("settings")}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => openPage("pages/options/index.html#privacy")}>
          {t("privacy")}
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => openPage("pages/onboarding/index.html")}>
          {t("help")}
        </button>
      </nav>

      <Dialog open={confirmDisable} onClose={() => setConfirmDisable(false)} title={t("disableTitle", { host: s.hostname ?? "" })}>
        <p>{t("disableBody")}</p>
        <div className="stack">
          <button type="button" className="btn btn-danger-solid wide" autoFocus onClick={() => void disable(false)}>
            {t("disableDelete")}
          </button>
          <button type="button" className="btn wide" onClick={() => void disable(true)}>
            {t("disableKeep")}
          </button>
          <p className="muted small">{t("disableKeepNote")}</p>
          <button type="button" className="btn btn-quiet wide" onClick={() => setConfirmDisable(false)}>
            {t("cancel")}
          </button>
        </div>
      </Dialog>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
