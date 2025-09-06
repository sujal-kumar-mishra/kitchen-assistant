import React, { useEffect, useRef } from "react";

declare global {
  interface Window { YT: any; onYouTubeIframeAPIReady: () => void; }
}

interface Props {
  videoId: string;
}

export default function YouTubePlayer({ videoId }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (!videoId) return;
    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
      window.onYouTubeIframeAPIReady = createPlayer;
    } else {
      createPlayer();
    }

    function createPlayer() {
      if (!containerRef.current) return;
      if (playerRef.current) {
        try { playerRef.current.loadVideoById(videoId); } catch (e) { /* ignore */ }
        return;
      }
      playerRef.current = new window.YT.Player(containerRef.current, {
        height: "360",
        width: "640",
        videoId,
        playerVars: { rel: 0 },
        events: {
          onReady: () => {},
          onStateChange: (_e: any) => {}
        }
      });
    }
  }, [videoId]);

  function play() { playerRef.current?.playVideo(); }
  function pause() { playerRef.current?.pauseVideo(); }
  function stop() { playerRef.current?.stopVideo(); }
  function seekTo(sec: number) { playerRef.current?.seekTo(sec, true); }

  return (
    <div>
      <div ref={containerRef} />
      <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <button className="btn secondary" onClick={play}>Play</button>
        <button className="btn secondary" onClick={pause}>Pause</button>
        <button className="btn secondary" onClick={stop}>Stop</button>
        <button className="btn secondary" onClick={() => seekTo(60)}>Seek 1:00</button>
      </div>
    </div>
  );
}
