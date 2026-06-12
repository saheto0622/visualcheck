import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { wrap, btnP, btnS, input } from "../lib/styles";

const label = { fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5, fontWeight: 500 };

export default function AdminOptometrists({ onBack }) {
  const [optometristas, setOptometristas] = useState([]);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [tarjeta, setTarjeta] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const { data, error } = await supabase.from("optometristas").select("*").order("id", { ascending: false });
      setOptometristas(error ? [] : (data || []));
    } catch {
      setOptometristas([]);
    }
  }

  useEffect(() => { load(); }, []);

  async function crear() {
    const n = nombre.trim(), c = codigo.trim(), t = tarjeta.trim();
    if (!n || !c) return;
    setSaving(true);
    setError("");
    try {
      const record = { id: Date.now(), nombre: n, codigo: c, activo: true, tarjeta_profesional: t || null };
      const { error } = await supabase.from("optometristas").insert(record);
      if (error) {
        setError(error.code === "23505" ? "Ese código ya está en uso." : "No se pudo crear el acceso.");
      } else {
        setOptometristas(prev => [record, ...prev]);
        setNombre(""); setCodigo(""); setTarjeta("");
      }
    } catch {
      setError("No se pudo crear el acceso.");
    }
    setSaving(false);
  }

  async function toggleActivo(opt) {
    try {
      await supabase.from("optometristas").update({ activo: !opt.activo }).eq("id", opt.id);
      setOptometristas(prev => prev.map(o => o.id === opt.id ? { ...o, activo: !o.activo } : o));
    } catch (e) { console.error(e); }
  }

  async function actualizarTarjeta(opt, val) {
    setOptometristas(prev => prev.map(o => o.id === opt.id ? { ...o, tarjeta_profesional: val } : o));
  }

  async function guardarTarjeta(opt) {
    try {
      await supabase.from("optometristas").update({ tarjeta_profesional: opt.tarjeta_profesional || null }).eq("id", opt.id);
    } catch (e) { console.error(e); }
  }

  return (
    <div style={wrap}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.5rem" }}>
        <button onClick={onBack} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>Optómetras</h2>
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "20px", marginBottom: "1.25rem" }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Crear acceso para optómetra</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 14px", lineHeight: 1.5 }}>
          Asigna un nombre y un código secreto único (ej. OPT-GARCIA-2025). Compártelo con el optómetra para que ingrese a su panel.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 10 }}>
          <div>
            <label style={label}>Nombre del optómetra</label>
            <input type="text" placeholder="Dra. García" value={nombre} onChange={e => setNombre(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>Código secreto</label>
            <input type="text" placeholder="OPT-GARCIA-2025" value={codigo} onChange={e => setCodigo(e.target.value)} style={input} />
          </div>
          <div>
            <label style={label}>Tarjeta profesional (opcional)</label>
            <input type="text" placeholder="TP-123456" value={tarjeta} onChange={e => setTarjeta(e.target.value)} style={input} />
          </div>
        </div>
        {error && <p style={{ fontSize: 12, color: "var(--color-text-danger)", margin: "0 0 8px" }}>{error}</p>}
        <button style={{ ...btnP, opacity: (saving || !nombre.trim() || !codigo.trim()) ? 0.5 : 1 }}
          onClick={crear} disabled={saving || !nombre.trim() || !codigo.trim()}>
          {saving ? "Creando..." : "Crear acceso"}
        </button>
      </div>

      {optometristas.length === 0 ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
          Aún no hay optómetras registrados.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {optometristas.map(opt => (
            <div key={opt.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px", background: "var(--color-background-primary)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px" }}>{opt.nombre}</p>
                  <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0, fontFamily: "monospace" }}>{opt.codigo}</p>
                </div>
                <button onClick={() => toggleActivo(opt)}
                  style={{ fontSize: 11, fontWeight: 500, padding: "5px 10px", borderRadius: 20, cursor: "pointer", border: "0.5px solid var(--color-border-secondary)",
                    background: opt.activo ? "var(--color-background-success)" : "var(--color-background-secondary)",
                    color:      opt.activo ? "var(--color-text-success)" : "var(--color-text-tertiary)" }}>
                  {opt.activo ? "Activo" : "Inactivo"}
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="text" placeholder="Tarjeta profesional"
                  value={opt.tarjeta_profesional || ""}
                  onChange={e => actualizarTarjeta(opt, e.target.value)}
                  onBlur={() => guardarTarjeta(opt)}
                  style={{ ...input, fontSize: 12, padding: "7px 10px" }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
