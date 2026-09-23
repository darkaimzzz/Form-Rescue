/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_FR_WEBSITE_ORIGIN?: string;
  readonly VITE_FR_REPO_URL?: string;
}
/** True only in the test build (dist-e2e); release bundles compile the instrumentation away. */
declare const __FR_E2E__: boolean;
