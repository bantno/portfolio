import { useState } from "react";

interface Annotation {
  ax: number;
  ay: number;
  lx: number;
  ly: number;
  text: string;
}

interface Layer {
  id: string;
  label: string;
  svgPath: string;
  svgPath2?: string;
  annotations: Annotation[];
}

interface Props {
  layers: Layer[];
  title: string;
  basePath?: string;
}

export function ExplodedAssembly({ layers, title, basePath = "" }: Props) {
  const [step, setStep] = useState(0);
  const total = layers.length;
  const current = layers[step];

  return (
    <div
      style={{
        margin: "2rem 0",
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderBottom: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.5rem",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--color-text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              fontWeight: 600,
              color: "var(--color-text-bright)",
              marginTop: "0.25rem",
            }}
          >
            {current.label}
          </div>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            color: "var(--color-text-muted)",
          }}
        >
          {step + 1} / {total}
        </div>
      </div>

      {/* Viewport */}
      <div
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "3 / 2",
          background: "var(--color-bg-raised)",
          overflow: "hidden",
        }}
      >
        {layers.map((layer, i) => {
          const offset =
            i < step ? -(step - i) * 250 : i > step ? (i - step) * 250 : 0;
          const opacity = i === step ? 1 : i < step ? 0.15 : 0.1;

          return (
            <div
              key={layer.id}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `translateY(${offset}px)`,
                opacity,
                transition: "transform 0.4s ease, opacity 0.4s ease",
                pointerEvents: i === step ? "auto" : "none",
              }}
            >
              {layer.svgPath2 ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", maxWidth: "80%", maxHeight: "95%" }}>
                  <img
                    src={`${basePath}${layer.svgPath}`}
                    alt={layer.label}
                    style={{ maxWidth: "100%", maxHeight: "44%", objectFit: "contain" }}
                  />
                  <div style={{ width: "60%", height: "1px", background: "var(--color-border-bright)", margin: "0.25rem 0" }} />
                  <img
                    src={`${basePath}${layer.svgPath2}`}
                    alt={`${layer.label} (alternate view)`}
                    style={{ maxWidth: "100%", maxHeight: "44%", objectFit: "contain" }}
                  />
                </div>
              ) : (
                <img
                  src={`${basePath}${layer.svgPath}`}
                  alt={layer.label}
                  style={{ maxWidth: "80%", maxHeight: "80%", objectFit: "contain" }}
                />
              )}
            </div>
          );
        })}

        {/* Leader lines */}
        <svg
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            pointerEvents: "none",
          }}
        >
          {current.annotations.map((a, i) => (
            <line
              key={i}
              x1={`${a.ax}%`}
              y1={`${a.ay}%`}
              x2={`${a.lx}%`}
              y2={`${a.ly}%`}
              stroke="var(--color-accent)"
              strokeWidth={1.5}
              strokeOpacity={0.8}
            />
          ))}
          {current.annotations.map((a, i) => (
            <circle
              key={`dot-${i}`}
              cx={`${a.ax}%`}
              cy={`${a.ay}%`}
              r={4}
              fill="var(--color-accent)"
            />
          ))}
        </svg>

        {/* Annotation labels */}
        {current.annotations.map((a, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${a.lx}%`,
              top: `${a.ly}%`,
              transform: "translate(-50%, -50%)",
              background: "rgba(10, 14, 26, 0.9)",
              border: "1px solid var(--color-border-bright)",
              borderRadius: "var(--radius)",
              padding: "0.5rem 0.75rem",
              maxWidth: 220,
              fontSize: "0.75rem",
              color: "var(--color-text)",
              lineHeight: 1.4,
              fontFamily: "var(--font-mono)",
              pointerEvents: "none",
            }}
          >
            {a.text}
          </div>
        ))}
      </div>

      {/* Controls */}
      <div
        style={{
          padding: "1rem 1.5rem",
          borderTop: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            padding: "0.5rem 1rem",
            border: "1px solid var(--color-border-bright)",
            borderRadius: "var(--radius)",
            background: step === 0 ? "transparent" : "var(--color-bg-raised)",
            color:
              step === 0
                ? "var(--color-text-muted)"
                : "var(--color-text-bright)",
            cursor: step === 0 ? "default" : "pointer",
            transition: "all 0.2s",
          }}
        >
          ← Previous
        </button>

        {/* Step indicators */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {layers.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                border: "none",
                background:
                  i === step
                    ? "var(--color-accent)"
                    : "var(--color-border-bright)",
                cursor: "pointer",
                padding: 0,
                transition: "background 0.2s",
              }}
              aria-label={`Go to layer ${i + 1}: ${layers[i].label}`}
            />
          ))}
        </div>

        <button
          onClick={() => setStep(Math.min(total - 1, step + 1))}
          disabled={step === total - 1}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.8rem",
            padding: "0.5rem 1rem",
            border: "1px solid var(--color-border-bright)",
            borderRadius: "var(--radius)",
            background:
              step === total - 1 ? "transparent" : "var(--color-bg-raised)",
            color:
              step === total - 1
                ? "var(--color-text-muted)"
                : "var(--color-text-bright)",
            cursor: step === total - 1 ? "default" : "pointer",
            transition: "all 0.2s",
          }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
