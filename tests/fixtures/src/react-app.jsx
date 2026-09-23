// React-controlled native inputs for restore tests. Synthetic only.
import { useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [text, setText] = useState("");
  const [agree, setAgree] = useState(false);
  return (
    <form id="react-form">
      <label htmlFor="rtext">React answer</label>
      <textarea id="rtext" name="rtext" value={text} onChange={(e) => setText(e.target.value)} />
      <p id="react-mirror">{text}</p>
      <label htmlFor="rflag">
        <input id="rflag" name="rflag" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Follow up later
      </label>
      <p id="react-flag">{agree ? "on" : "off"}</p>
    </form>
  );
}
createRoot(document.getElementById("app")).render(<App />);
