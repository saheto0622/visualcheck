import { useState } from "react";
import { FRAMES } from "../data/frames";

const FILTERS = [
  { val: "todos",  label: "Todos" },
  { val: "hombre", label: "Hombre" },
  { val: "mujer",  label: "Mujer" },
  { val: "unisex", label: "Unisex" },
];

function fmt(n) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

export default function Catalog({ onSelect, onBack }) {
  const [filtro, setFiltro] = useState("todos");

  const visibles = FRAMES.filter(
    (f) => filtro === "todos" || f.genero === filtro
  );

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 3rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
        <button
          onClick={onBack}
          style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--color-text-secondary)", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>
          ← Volver
        </button>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Tienda</h2>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>{FRAMES.length} monturas disponibles</p>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {FILTERS.map(({ val, label }) => (
          <button
            key={val}
            onClick={() => setFiltro(val)}
            style={{
              padding: "6px 14px", fontSize: 12, borderRadius: 20, cursor: "pointer",
              fontWeight: filtro === val ? 500 : 400,
              background: filtro === val ? "var(--color-text-primary)" : "var(--color-background-secondary)",
              color:      filtro === val ? "var(--color-background-primary)" : "var(--color-text-secondary)",
              border: "0.5px solid var(--color-border-secondary)",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {visibles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-text-tertiary)", fontSize: 13 }}>
          No hay monturas con este filtro.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {visibles.map((frame) => (
            <button
              key={frame.id}
              onClick={() => onSelect(frame)}
              style={{
                background: "var(--color-background-primary)",
                border: "0.5px solid var(--color-border-tertiary)",
                borderRadius: "var(--border-radius-lg)",
                padding: 0,
                cursor: "pointer",
                textAlign: "left",
                overflow: "hidden",
                transition: "box-shadow 0.15s",
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.10)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
              {/* Imagen */}
              <div style={{ background: "var(--color-background-secondary)", padding: "18px 12px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 90 }}>
                <img
                  src={frame.imagen_url}
                  alt={frame.nombre}
                  style={{ width: "100%", maxWidth: 160, height: 60, objectFit: "contain" }}
                />
              </div>
              {/* Info */}
              <div style={{ padding: "10px 12px" }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px", lineHeight: 1.3 }}>{frame.nombre}</p>
                <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 6px", textTransform: "capitalize" }}>{frame.genero}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", margin: 0 }}>{fmt(frame.precio)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
