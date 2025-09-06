import React from "react";

interface Props {
  items: any[];
  onSelect: (id: string, title?: string) => void;
}

export default function SearchResults({ items, onSelect }: Props) {
  if (!items || items.length === 0) return <div style={{ color: "#777" }}>No results</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {items.map((it: any) => (
        <div key={it.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 8, borderRadius: 8, border: "1px solid #eef2f7" }}>
          <img src={it.thumbnail} width={110} height={62} alt="" style={{ objectFit: "cover", borderRadius: 6 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600 }}>{it.title}</div>
            <div style={{ fontSize: 12, color: "#666" }}>{it.channel} • {new Date(it.publishedAt).toLocaleDateString()}</div>
          </div>
          <div>
            <button className="btn" onClick={() => onSelect(it.id, it.title)}>Play</button>
          </div>
        </div>
      ))}
    </div>
  );
}
