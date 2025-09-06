import React, { useEffect, useState } from "react";
import { FRONTEND_BACKEND_URL } from "../config";
import io from "socket.io-client";

const socket = io(FRONTEND_BACKEND_URL);

export default function TimerPanel({ pushLog }: { pushLog: (s: string) => void }) {
  const [timers, setTimers] = useState<{ id: number; secondsLeft: number }[]>([]);
  const [seconds, setSeconds] = useState<number>(10);

  useEffect(() => {
    // bootstrap timers
    socket.on("timer:bootstrap", (p: any) => setTimers(p.timers || []));
    socket.on("timer:started", (p: any) => {
      setTimers(prev => [{ id: p.id, secondsLeft: p.secondsLeft }, ...prev.filter(t => t.id !== p.id)]);
    });
    socket.on("timer:update", (p: any) => {
      setTimers(prev => prev.map(t => (t.id === p.id ? { ...t, secondsLeft: p.secondsLeft } : t)));
    });
    socket.on("timer:done", (p: any) => {
      setTimers(prev => prev.filter(t => t.id !== p.id));
      pushLog(`Timer ${p.id} done`);
    });
    socket.on("timer:stopped", (p: any) => {
      setTimers(prev => prev.filter(t => t.id !== p.id));
      pushLog(`Timer ${p.id} stopped`);
    });

    return () => {
      socket.off("timer:bootstrap");
      socket.off("timer:started");
      socket.off("timer:update");
      socket.off("timer:done");
      socket.off("timer:stopped");
    };
  }, [pushLog]);

  async function startTimer() {
    try {
      const resp = await fetch(`${FRONTEND_BACKEND_URL}/timer/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds })
      });
      const j = await resp.json();
      if (j.id) pushLog(`Started timer #${j.id}`);
      else pushLog("Failed to start timer");
    } catch (err) {
      console.error(err);
      pushLog("Failed to start timer");
    }
  }

  async function stopTimer(id: number) {
    try {
      const resp = await fetch(`${FRONTEND_BACKEND_URL}/timer/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const j = await resp.json();
      if (j.success) pushLog(`Stopped timer ${id}`);
    } catch (err) {
      console.error(err);
      pushLog("Failed to stop timer");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input type="number" value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} style={{ padding: 6, width: 120 }} />
        <button className="btn" onClick={startTimer}>Start</button>
      </div>

      <div style={{ marginTop: 10 }}>
        {timers.length === 0 ? <div style={{ color: "#777" }}>No timers</div> :
          timers.map(t => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }}>
              <div>Timer #{t.id} — {t.secondsLeft}s</div>
              <div>
                <button className="btn secondary" onClick={() => stopTimer(t.id)}>Stop</button>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
