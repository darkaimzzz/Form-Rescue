import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { Header } from "../../ui/common.js";
import { PRACTICE_FORM_URL, REPO_URL } from "../../ui/links.js";
import { t } from "../../ui/strings.js";
import "../../ui/styles.css";

function Onboarding() {
  const [showEnable, setShowEnable] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  return (
    <div className="page">
      <Header title={t("onbTitle")} />
      <main className="stack">
        <section className="card stack" aria-labelledby="onb-title">
          <h2 id="onb-title" style={{ fontSize: "1.75rem" }}>
            {t("onbTitle")}
          </h2>
          <p>{t("onbLead")}</p>
        </section>
        <section className="card" aria-labelledby="p1">
          <h3 id="p1">{t("onbPoint1Title")}</h3>
          <p>{t("onbPoint1")}</p>
        </section>
        <section className="card" aria-labelledby="p2">
          <h3 id="p2">{t("onbPoint2Title")}</h3>
          <p>{t("onbPoint2")}</p>
        </section>
        <section className="card" aria-labelledby="p3">
          <h3 id="p3">{t("onbPoint3Title")}</h3>
          <p>{t("onbPoint3")}</p>
        </section>
        <div className="btn-row">
          {PRACTICE_FORM_URL ? (
            <a className="btn" href={PRACTICE_FORM_URL} target="_blank" rel="noopener">
              {t("onbTryDemo")}
            </a>
          ) : (
            <button type="button" className="btn" aria-expanded={showDemo} onClick={() => setShowDemo((v) => !v)}>
              {t("onbTryDemo")}
            </button>
          )}
          <button type="button" className="btn btn-primary" aria-expanded={showEnable} onClick={() => setShowEnable((v) => !v)}>
            {t("onbEnable")}
          </button>
        </div>
        {showEnable && <p className="notice notice-ok">{t("onbEnableHow")}</p>}
        {showDemo && (
          <p className="notice">
            {t("onbDemoLocal")}
            {REPO_URL ? (
              <>
                {" "}
                <a href={`${REPO_URL}#try-it`}>{t("onbDemoReadme")}</a>
              </>
            ) : null}
          </p>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Onboarding />
  </StrictMode>,
);
