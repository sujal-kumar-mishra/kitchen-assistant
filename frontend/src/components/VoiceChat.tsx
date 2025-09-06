import React, { useEffect, useRef, useState } from "react";
import { FRONTEND_BACKEND_URL } from "../config";
import io from "socket.io-client";

interface Props {
  onPlayVideo: (id: string, title?: string) => void;
  onSearchResults: (items: any[]) => void;
  pushLog: (s: string) => void;
}

const socket = io(FRONTEND_BACKEND_URL);

export default function VoiceChat({ onPlayVideo, onSearchResults, pushLog }: Props) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Socket timer events for UI logs
    socket.on("timer:update", (p: any) => {
      pushLog(`Timer ${p.id}: ${p.secondsLeft}s`);
    });
    socket.on("timer:done", (p: any) => {
      pushLog(`Timer ${p.id} done`);
      // optionally: play TTS using backend to notify
      speak("Timer finished");
    });

    // detect Web Speech API
    const SpeechRecognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(Boolean(SpeechRecognition));
    if (SpeechRecognition) {
      const r = new SpeechRecognition();
      r.lang = "en-US";
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (ev: any) => {
        const s = ev.results[0][0].transcript;
        setText(s);
        pushLog(`Heard: ${s}`);
        handleCommand(s);
      };
      r.onend = () => setListening(false);
      recognitionRef.current = r;
    }

    return () => {
      socket.off("timer:update");
      socket.off("timer:done");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startListening() {
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch (e) {
      console.warn("recognition start error", e);
    }
  }
  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  async function handleCommand(cmd: string) {
    const lower = cmd.toLowerCase();

    // Simple intent routing
    // 1) play/search youtube: "play [something]" or "search [something]"
    if (/(play|search)\b/.test(lower)) {
      // attempt to extract query after play/search
      const q = lower.replace(/^(play|search)\s*/i, "").trim() || cmd;
      pushLog(`Searching Youtube for "${q}"`);
      try {
        const res = await fetch(`${FRONTEND_BACKEND_URL}/youtube/search?q=${encodeURIComponent(q)}`);
        const items = await res.json();
        onSearchResults(items);
        if (items?.length > 0) {
          onPlayVideo(items[0].id, items[0].title);
        } else {
          speak(`I couldn't find any video for ${q}`);
        }
      } catch (err) {
        console.error(err);
        pushLog("YouTube search failed");
        speak("Sorry, YouTube search failed.");
      }
      return;
    }

    // 2) timers: "set timer for 5 minutes" or "set a 10 second timer"
    if (/timer|set a timer|start a timer|countdown/.test(lower)) {
      // parse number and unit
      const m = lower.match(/(\d+)\s*(second|seconds|minute|minutes|min|mins|hr|hour|hours)?/);
      if (m) {
        const val = Number(m[1]);
        const unit = m[2] || "seconds";
        let seconds = val;
        if (/min|minute/.test(unit)) seconds = val * 60;
        if (/hour|hr/.test(unit)) seconds = val * 3600;
        // call backend to start timer
        try {
          const resp = await fetch(`${FRONTEND_BACKEND_URL}/timer/start`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ seconds })
          });
          const j = await resp.json();
          if (j.id) {
            pushLog(`Started timer #${j.id} for ${seconds}s`);
            speak(`Started timer for ${val} ${unit}`);
          } else {
            pushLog(`Timer start failed`);
            speak("Couldn't start timer");
          }
        } catch (err) {
          console.error(err);
          pushLog("Timer start failed");
          speak("Timer start failed");
        }
      } else {
        speak("Please tell me how long the timer should be.");
      }
      return;
    }

    // 3) conversion: "convert 1 cup to ml" or "how many tablespoons in a cup"
    if (/convert|how many|how much|what is/i.test(lower) && /(cup|tablespoon|teaspoon|ml|liter|ounce|gram)/.test(lower)) {
      // try simple parse like "convert 1 cup to ml"
      const m = lower.match(/(\d+(?:\.\d+)?)\s*(cup|cups|tablespoon|tablespoons|tbsp|teaspoon|teaspoons|tsp|ml|milliliter|liter|l|oz|ounce|grams|gram|g)\s*(?:to|in|into)?\s*(cup|tablespoon|teaspoon|ml|liter|oz|ounce|gram|g)?/);
      if (m) {
        const val = Number(m[1]);
        const fromRaw = m[2];
        let toRaw = m[3];
        // normalize
        const normalMap: Record<string,string> = {
          cups: "cup", cup: "cup",
          tablespoons: "tablespoon", tablespoon: "tablespoon", tbsp: "tablespoon",
          teaspoons: "teaspoon", teaspoon: "teaspoon", tsp: "teaspoon",
          milliliter: "ml", ml: "ml", l: "liter", liter: "liter",
          oz: "ounce", ounce: "ounce", grams: "gram", gram: "gram", g: "gram"
        };
        const from = normalMap[fromRaw] || fromRaw;
        const to = normalMap[toRaw] || toRaw;
        if (!to) {
          speak(`What unit do you want to convert ${from} to?`);
          return;
        }
        try {
          const url = `${FRONTEND_BACKEND_URL}/convert?value=${encodeURIComponent(val)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
          const resp = await fetch(url);
          const j = await resp.json();
          if (j.result != null) {
            const out = `${val} ${from} ≈ ${j.result} ${to}`;
            pushLog(out);
            speak(out);
          } else {
            pushLog("Conversion failed");
            speak("Conversion failed");
          }
        } catch (err) {
          console.error(err);
          pushLog("Conversion failed");
          speak("Conversion failed");
        }
      } else {
        speak("I couldn't parse the conversion. Try saying, convert one cup to milliliters.");
      }
      return;
    }

    // 4) fallback: repeat using TTS or reply with a simple acknowledgment
    speak(`You said: ${cmd}`);
  }

  async function speak(text: string) {
    // Use TTS proxy on backend to produce audio, then play
    try {
      const payload = { voice_id: "alloy", text }; // voice_id placeholder — set to a real one or use default in ElevenLabs
      const resp = await fetch(`${FRONTEND_BACKEND_URL}/elevenlabs/tts-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const txt = await resp.text();
        console.warn("TTS proxy failed", txt);
        return;
      }
      const ab = await resp.arrayBuffer();
      const blob = new Blob([ab], { type: resp.headers.get("content-type") || "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play();
    } catch (err) {
      console.error("speak error", err);
    }
  }

  // Manual submit (typed)
  function onSubmitText() {
    if (text.trim()) {
      pushLog("Command: " + text);
      handleCommand(text);
    }
  }

  // Quick simulate button for testing
  async function simulateSearch() {
    const q = "butter chicken 5 minute";
    setText(q);
    pushLog("Simulating: " + q);
    handleCommand(q);
  }

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <h3>Voice Control</h3>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Say something or type here..." style={{ flex: 1, padding: 8, borderRadius: 6, border: "1px solid #e6edf2" }} />
        {supported ? (
          <button className="btn" onClick={() => (listening ? stopListening() : startListening())}>
            {listening ? "Stop" : "Speak"}
          </button>
        ) : (
          <button className="btn secondary" disabled>Speech not supported</button>
        )}
        <button className="btn secondary" onClick={onSubmitText}>Send</button>
        <button className="btn secondary" onClick={simulateSearch}>Simulate</button>
      </div>

      <p style={{ marginTop: 10, color: "#555", fontSize: 13 }}>
        Tip: Try commands like:
        <br />• "Play butter chicken tutorial" • "Set a 2 minute timer" • "Convert 1 cup to ml"
      </p>
    </div>
  );
}
