import React, { useState } from "react";
import { FRONTEND_BACKEND_URL } from "../config";

export default function ConverterPanel({ pushLog }: { pushLog: (s: string) => void }) {
  const [value, setValue] = useState<number>(1);
  const [from, setFrom] = useState<string>("cup");
  const [to, setTo] = useState<string>("ml");
  const [result, setResult] = useState<number | null>(null);

  async function convert() {
    try {
      const resp = await fetch(`${FRONTEND_BACKEND_URL}/convert?value=${encodeURIComponent(value)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      const j = await resp.json();
      if (j.result != null) {
        setResult(j.result);
        pushLog(`${value} ${from} = ${j.result} ${to}`);
      } else {
        setResult(null);
        pushLog("Conversion failed");
      }
    } catch (err) {
      console.error(err);
      pushLog("Conversion failed");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} style={{ padding: 6, width: 100 }} />
        <select value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: 6 }}>
          <option value="cup">cup</option>
          <option value="tablespoon">tablespoon</option>
          <option value="teaspoon">teaspoon</option>
          <option value="ml">ml</option>
          <option value="liter">liter</option>
          <option value="ounce">ounce</option>
        </select>
        <div style={{ alignSelf: "center" }}>→</div>
        <select value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: 6 }}>
          <option value="ml">ml</option>
          <option value="cup">cup</option>
          <option value="tablespoon">tablespoon</option>
          <option value="teaspoon">teaspoon</option>
          <option value="liter">liter</option>
          <option value="ounce">ounce</option>
        </select>
        <button className="btn" onClick={convert}>Convert</button>
      </div>

      <div style={{ marginTop: 10 }}>
        {result != null ? <div>Result: <strong>{result}</strong></div> : <div style={{ color: "#777" }}>No result</div>}
      </div>
    </div>
  );
}
