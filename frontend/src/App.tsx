import React, { useState } from "react";
import VoiceChat from "./components/VoiceChat";
import YouTubePlayer from "./components/YouTubePlayer";
import TimerPanel from "./components/TimerPanel";
import ConverterPanel from "./components/ConverterPanel";
import SearchResults from "./components/SearchResults";

export default function App() {
  const [videoId, setVideoId] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [log, setLog] = useState<string[]>([]);

  function pushLog(msg: string) {
    setLog(prev => [new Date().toLocaleTimeString() + " — " + msg, ...prev].slice(0, 200));
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🍳 Kitchen Assistant (Fast MVP)</h1>
      </div>

      <VoiceChat
        onPlayVideo={(id, title) => { setVideoId(id); pushLog('Playing video: ' + title); }}
        onSearchResults={(items) => { setSearchResults(items); pushLog(`Found ${items.length} video(s)`); }}
        pushLog={pushLog}
      />

      <div className="grid">
        <div>
          <div className="panel">
            <h3>Player</h3>
            {videoId ? <YouTubePlayer videoId={videoId} /> : <p>No video loaded. Use voice or search to play.</p>}
          </div>

          <div style={{ height: 12 }} />

          <div className="panel">
            <h3>Search Results</h3>
            <SearchResults items={searchResults} onSelect={(id, title) => { setVideoId(id); pushLog('Selected: ' + title); }} />
          </div>
        </div>

        <div>
          <div className="panel">
            <h3>Timers</h3>
            <TimerPanel pushLog={pushLog} />
          </div>

          <div style={{ height: 12 }} />

          <div className="panel">
            <h3>Converter</h3>
            <ConverterPanel pushLog={pushLog} />
          </div>

          <div style={{ height: 12 }} />

          <div className="panel">
            <h3>Activity Log</h3>
            <div className="log">
              {log.length === 0 ? <div style={{ color: "#777" }}>No activity yet</div> :
                log.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
