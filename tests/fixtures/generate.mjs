/**
 * Generates the synthetic fixture pages in tests/fixtures/pages.
 * Every page and value is synthetic. Run: node tests/fixtures/generate.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";

const out = new URL("./pages/", import.meta.url);
const page = (title, bar, body, script = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} — synthetic</title><link rel="stylesheet" href="/fixture.css"></head>
<body><div class="bar">${bar}</div><main>
${body}
</main>${script ? `<script>${script}</script>` : ""}</body></html>
`;

const pages = {
  "index.html": page(
    "Fixtures",
    "Form Rescue fixtures <small>synthetic test pages</small>",
    `<ul>
${[
  ["/demo.html", "Support request (demo)"],
  ["/login.html", "Login form"],
  ["/checkout.html", "Checkout form"],
  ["/dynamic.html", "Dynamic form"],
  ["/spa/start", "Single-page app"],
  ["/react.html", "React-controlled inputs"],
  ["/vue.html", "Vue-controlled inputs"],
  ["/shadow.html", "Open shadow root"],
  ["/repeated.html", "Repeated fields"],
  ["/autofill.html", "Prepopulated (autofill-like)"],
  ["/frame.html", "Blocked frame"],
  ["/session/form", "Session expiry and sign-in return"],
  ["/sensitive.html", "Sensitive fields"],
  ["/perf.html", "200-control performance form"],
  ["/virtual.html", "Fields outside a form"],
  ["/rerender.html", "Framework rerender"],
]
  .map(([h, t]) => `<li><a href="${h}">${t}</a></li>`)
  .join("\n")}
</ul>`,
  ),

  "demo.html": page(
    "Contact support",
    "Example Help Desk <small>synthetic demo page for Form Rescue</small>",
    `<h1>Contact support</h1>
<p class="note">This is a synthetic page for trying Form Rescue. Don't enter private information.</p>
<form id="support" action="/demo-submitted" method="post">
  <label for="subject">Subject</label>
  <input id="subject" name="subject" type="text">
  <label for="topic">Topic</label>
  <select id="topic" name="topic"><option value="">Choose…</option><option value="billing-question">Billing question</option><option value="bug">Something is broken</option><option value="idea">Feature idea</option></select>
  <label for="details">Describe what happened</label>
  <textarea id="details" name="details"></textarea>
  <fieldset class="inline"><legend>Preferred reply</legend>
    <input type="radio" id="r-mail" name="reply" value="message"><label for="r-mail">Message</label>
    <input type="radio" id="r-call" name="reply" value="callback"><label for="r-call">Callback</label>
  </fieldset>
  <p><input type="checkbox" id="urgent" name="urgent" value="yes"><label for="urgent" style="display:inline;font-weight:400"> This is urgent</label></p>
  <label for="site-search">Search help articles</label>
  <input id="site-search" name="q" type="search">
  <button type="submit">Send</button>
</form>`,
  ),

  "login.html": page(
    "Sign in",
    "Synthetic login",
    `<form id="login"><label for="user">Username</label><input id="user" name="username" autocomplete="username">
<label for="pw">Password</label><input id="pw" name="password" type="password" autocomplete="current-password">
<label for="note">Note to admin</label><textarea id="note" name="note"></textarea><button>Sign in</button></form>`,
  ),

  "checkout.html": page(
    "Checkout",
    "Synthetic checkout",
    `<form id="checkout"><label for="cc">Card number</label><input id="cc" name="cardnumber" autocomplete="cc-number">
<label for="gift">Gift message</label><textarea id="gift" name="gift"></textarea><button>Pay</button></form>`,
  ),

  "dynamic.html": page(
    "Dynamic form",
    "Dynamic form",
    `<div id="slot"><p>Loading…</p></div>
<button type="button" id="make-sensitive">Add password field</button>`,
    `setTimeout(() => {
  document.getElementById("slot").innerHTML = '<form id="dyn"><label for="story">Your story</label><textarea id="story" name="story"></textarea><label for="storytitle">Story title</label><input id="storytitle" name="storytitle"></form>';
}, 400);
document.getElementById("make-sensitive").onclick = () => {
  const i = document.createElement("input"); i.type = "password"; i.name = "pw"; document.getElementById("dyn").append(i);
};`,
  ),

  "spa.html": page(
    "SPA",
    "Synthetic single-page app",
    `<nav><a href="/spa/start" data-route id="to-start">Start</a> · <a href="/spa/other?tab=2" data-route id="to-other">Other</a> · <a href="#section" id="hashlink">Hash</a></nav>
<div id="view"></div>`,
    `function render() {
  const v = document.getElementById("view");
  v.textContent = "";
  const f = document.createElement("form"); f.id = "spa-form";
  f.innerHTML = '<label for="body">Body</label><textarea id="body" name="body"></textarea><label for="title">Title</label><input id="title" name="title">';
  const h = document.createElement("h2"); h.textContent = location.pathname; v.append(h, f);
}
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-route]");
  if (!a) return;
  e.preventDefault(); history.pushState({}, "", a.getAttribute("href")); render();
});
addEventListener("popstate", render);
render();`,
  ),

  "shadow.html": page(
    "Shadow DOM",
    "Open shadow root",
    `<comment-box id="host"></comment-box>`,
    `customElements.define("comment-box", class extends HTMLElement {
  connectedCallback() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = '<form id="inner"><label for="c">Comment</label><textarea id="c" name="comment" style="width:100%;min-height:120px"></textarea><label for="t">Headline</label><input id="t" name="headline"></form>';
  }
});`,
  ),

  "repeated.html": page(
    "Repeated fields",
    "Repeated fields",
    `<form id="rep"><label>Answer</label><textarea name="answer"></textarea><label>Answer</label><textarea name="answer"></textarea></form>`,
  ),

  "autofill.html": page(
    "Prepopulated",
    "Prepopulated fields",
    `<form id="pre"><label for="headline">Headline</label><input id="headline" name="headline">
<label for="summary">Summary</label><textarea id="summary" name="summary"></textarea></form>`,
    `// Simulates browser autofill / restored content when the session flag is set by the test.
if (sessionStorage.getItem("prefill")) document.getElementById("summary").value = "Text the browser restored by itself.";`,
  ),

  "frame.html": page(
    "Frames",
    "Frame fixture",
    `<p>The form below is inside an iframe and must never be captured.</p>
<iframe id="f" title="Embedded demo form" src="/demo.html" style="width:100%;height:600px;border:1px solid #ccc"></iframe>`,
  ),

  "session/login.html": page(
    "Session expired",
    "Synthetic app — signed out",
    `<h1>Your session expired</h1>
<form id="signin" method="post" action="/session/login"><label for="u">Username</label><input id="u" name="username" autocomplete="username">
<label for="p">Password</label><input id="p" name="password" type="password"><button id="signin-btn">Sign in</button></form>`,
  ),

  "session/form.html": page(
    "Application",
    'Synthetic app — signed in <a href="/session/logout" id="logout">Sign out</a>',
    `<form id="app"><label for="essay">Why do you want this role?</label><textarea id="essay" name="essay"></textarea></form>`,
  ),

  "sensitive.html": page(
    "Sensitive fields",
    "Sensitive fields",
    `<form id="secrets">
  <label for="otp-like">Verification code</label><input id="otp-like" name="code2" class="trap">
  <label for="apikey">API key</label><input id="apikey" name="apiKey" class="trap">
  <label for="secret-notes">Notes (in a form with secret fields)</label><textarea id="secret-notes" name="notes" class="trap"></textarea>
</form>
<form id="profile">
  <label for="optout">Opted out</label><textarea id="optout" name="optout" data-form-rescue="off" class="trap"></textarea>
  <label for="acoff">Autocomplete off</label><input id="acoff" name="acoff" autocomplete="off" class="trap">
  <label for="mail">Email</label><input id="mail" name="mail" type="email" class="trap">
  <label for="bio">Short bio</label><textarea id="bio" name="bio"></textarea>
</form>`

  ),

  "virtual.html": page(
    "No form element",
    "Fields outside a form",
    `<section id="feedback" aria-label="Feedback"><label for="fb">Feedback</label><textarea id="fb" name="feedback"></textarea></section>
<div><label for="loose">Loose note</label><input id="loose" name="loose"></div>`,
  ),

  "rerender.html": page(
    "Framework rerender",
    "Rerendering form",
    `<form id="rr"><label for="rr-text">Answer</label><textarea id="rr-text" name="rrtext"></textarea></form>`,
    `// Simulates a framework that resets its field to internal state on the next render, ignoring external values.
const el = document.getElementById("rr-text");
let internal = "";
el.addEventListener("input", (e) => { if (e.isTrusted) internal = el.value; else requestAnimationFrame(() => { el.value = internal; }); });`,
  ),

  "react.html": page(
    "React-controlled",
    "React-controlled inputs",
    `<div id="app"></div>`,
  ).replace("</body>", '<script src="/react-app.js"></script></body>'),

  "vue.html": page("Vue-controlled", "Vue-controlled inputs", `<div id="app"></div>`).replace(
    "</body>",
    '<script src="/vue.global.prod.js"></script><script src="/vue-app.js"></script></body>',
  ),

  "vue-app.js": `Vue.createApp({
  data: () => ({ note: "", choice: "" }),
  template: '<form id="vue-form"><label for="vnote">Vue note</label><textarea id="vnote" name="vnote" v-model="note"></textarea><p id="vue-mirror">{{ note }}</p><label for="vchoice">Vue choice</label><select id="vchoice" name="vchoice" v-model="choice"><option value="">None</option><option value="a">A</option><option value="b">B</option></select></form>',
}).mount("#app");
`,
};

let rows = "";
for (let i = 0; i < 200; i++) {
  rows +=
    i % 4 === 0
      ? `<label for="f${i}">Note ${i}</label><textarea id="f${i}" name="note${i}" rows="1"></textarea>`
      : `<label for="f${i}">Item ${i}</label><input id="f${i}" name="item${i}">`;
}
pages["perf.html"] = page("200 controls", "200-control performance fixture", `<form id="big">${rows}</form>`);

await mkdir(new URL("session/", out), { recursive: true });
for (const [name, html] of Object.entries(pages)) await writeFile(new URL(name, out), html);
console.log(`Wrote ${Object.keys(pages).length} fixture files.`);

// Framework bundles: React fixture compiled locally, Vue's own prebuilt global build copied.
const { build } = await import("vite");
const react = (await import("@vitejs/plugin-react")).default;
const { copyFile } = await import("node:fs/promises");
const { createRequire } = await import("node:module");
await build({
  configFile: false,
  logLevel: "warn",
  plugins: [react()],
  define: { "process.env.NODE_ENV": '"production"' },
  build: {
    outDir: new URL(".", out).pathname.replace(/^\/([A-Za-z]:)/, "$1"),
    emptyOutDir: false,
    lib: { entry: new URL("./src/react-app.jsx", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), formats: ["iife"], name: "fixtureReact", fileName: () => "react-app.js" },
  },
});
const require = createRequire(new URL("../../apps/extension/package.json", import.meta.url));
await copyFile(require.resolve("vue/dist/vue.global.prod.js", { paths: [process.cwd()] }), new URL("vue.global.prod.js", out));
console.log("Built framework fixtures.");
