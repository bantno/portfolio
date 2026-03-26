import { useState } from "react";

interface Hotspot {
  x: number;
  y: number;
  label: string;
  description: string;
}

interface Props {
  src: string;
  alt: string;
  hotspots: Hotspot[];
}

export function AnnotatedFigure({ src, alt, hotspots }: Props) {
  const [active, setActive] = useState<number | null>(null);

  return (
    <div style={{ position: "relative", margin: "2rem 0" }}>
      <div
        style={{
          position: "relative",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
          background: "var(--color-bg-raised)",
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{ width: "100%", height: "auto", display: "block" }}
        />
        {hotspots.map((h, i) => (
          <button
            key={i}
            onClick={() => setActive(active === i ? null : i)}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            style={{
              position: "absolute",
              left: `${h.x}%`,
              top: `${h.y}%`,
              transform: "translate(-50%, -50%)",
              width: 28,
              height: 28,
              borderRadius: "50%",
              border: "2px solid var(--color-accent)",
              background:
                active === i
                  ? "var(--color-accent)"
                  : "rgba(232, 197, 71, 0.2)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.7rem",
              fontWeight: 700,
              color:
                active === i ? "var(--color-bg)" : "var(--color-accent)",
              fontFamily: "var(--font-mono)",
              transition: "all 0.2s",
              padding: 0,
            }}
            aria-label={h.label}
          >
            {i + 1}
          </button>
        ))}

        {active !== null && (
          <div
            style={{
              position: "absolute",
              left: `${hotspots[active].x}%`,
              top: `${hotspots[active].y}%`,
              transform:
                hotspots[active].x > 60
                  ? "translate(-105%, -120%)"
                  : "translate(20%, -120%)",
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-bright)",
              borderRadius: "var(--radius)",
              padding: "0.75rem 1rem",
              maxWidth: 260,
              zIndex: 10,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "var(--color-accent)",
                marginBottom: "0.25rem",
              }}
            >
              {hotspots[active].label}
            </div>
            <div
              style={{
                fontSize: "0.8rem",
                color: "var(--color-text)",
                lineHeight: 1.4,
              }}
            >
              {hotspots[active].description}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
