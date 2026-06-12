import { useState } from "react";
import { supabase } from "../lib/supabase";
import { getRisk, fromDb, VALIDACION_INFO, VT_TESTS, SEMAFORO_INFO, HC_QUESTIONS } from "../lib/format";
import { wrap, btnP, btnS, input } from "../lib/styles";

const FORMULA_FIELDS = [
  { key: "esfera",  label: "Esfera",  step: "0.25" },
  { key: "cilindro",label: "Cilindro",step: "0.25" },
  { key: "eje",     label: "Eje",     step: "1", min: 0, max: 180 },
  { key: "adicion", label: "Adición", step: "0.25" },
];

const label = { fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5, fontWeight: 500 };
const card  = { border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.25rem" };
const sectionTitle = { fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: ".05em" };

function parseNum(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function parseEje(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function emptyForm(ev) {
  return {
    esferaOd:  ev?.esferaOd  ?? "", cilindroOd: ev?.cilindroOd ?? "", ejeOd: ev?.ejeOd ?? "", adicionOd: ev?.adicionOd ?? "",
    esferaOi:  ev?.esferaOi  ?? "", cilindroOi: ev?.cilindroOi ?? "", ejeOi: ev?.ejeOi ?? "", adicionOi: ev?.adicionOi ?? "",
    observaciones: ev?.observacionesOptometra ?? "",
  };
}

export default function OptometristPanel({ onExit }) {
  const [view, setView] = useState("login"); // login | dashboard | caso
  const [code, setCode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loading, setLoading] = useState(false);
  const [optometrista, setOptometrista] = useState(null);
  const [casos, setCasos] = useState([]);
  const [filtro, setFiltro] = useState("en revision"); // en revision | validada | todos
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  async function login() {
    const codigo = code.trim();
    if (!codigo) return;
    setLoading(true);
    setLoginError("");
    try {
      const { data, error } = await supabase
        .from("optometristas")
        .select("*")
        .eq("codigo", codigo)
        .eq("activo", true)
        .maybeSingle();
      if (error || !data) {
        setLoginError("Código no válido o inactivo.");
      } else {
        setOptometrista(data);
        await loadCasos(data.id);
        setView("dashboard");
        setCode("");
      }
    } catch {
      setLoginError("No se pudo verificar el código.");
    }
    setLoading(false);
  }

  async function loadCasos(optometristaId) {
    try {
      const { data, error } = await supabase
        .from("evaluaciones")
        .select("*")
        .eq("optometrista_id", optometristaId)
        .order("id", { ascending: false });
      setCasos(error ? [] : (data || []).map(fromDb));
    } catch {
      setCasos([]);
    }
  }

  function abrirCaso(ev) {
    setSelected(ev);
    setForm(emptyForm(ev));
    setSaveMsg("");
    setView("caso");
  }

  async function guardar(aprobar) {
    setSaving(true);
    setSaveMsg("");
    const updates = {
      esfera_od: parseNum(form.esferaOd), cilindro_od: parseNum(form.cilindroOd),
      eje_od: parseEje(form.ejeOd), adicion_od: parseNum(form.adicionOd),
      esfera_oi: parseNum(form.esferaOi), cilindro_oi: parseNum(form.cilindroOi),
      eje_oi: parseEje(form.ejeOi), adicion_oi: parseNum(form.adicionOi),
      observaciones_optometra: form.observaciones || null,
    };
    if (aprobar) {
      updates.estado_validacion = "validada";
      updates.validado_en = new Date().toISOString();
      updates.optometrista_tarjeta = optometrista.tarjeta_profesional || null;
    } else if (selected.estadoValidacion === "validada") {
      updates.estado_validacion = "en revision";
      updates.validado_en = null;
    }
    try {
      await supabase.from("evaluaciones").update(updates).eq("id", selected.id);
      const updated = {
        ...selected,
        esferaOd: updates.esfera_od, cilindroOd: updates.cilindro_od, ejeOd: updates.eje_od, adicionOd: updates.adicion_od,
        esferaOi: updates.esfera_oi, cilindroOi: updates.cilindro_oi, ejeOi: updates.eje_oi, adicionOi: updates.adicion_oi,
        observacionesOptometra: updates.observaciones_optometra,
        estadoValidacion: updates.estado_validacion ?? selected.estadoValidacion,
        validadoEn: "validado_en" in updates ? updates.validado_en : selected.validadoEn,
        optometristaTarjeta: "optometrista_tarjeta" in updates ? updates.optometrista_tarjeta : selected.optometristaTarjeta,
      };
      setSelected(updated);
      setCasos(prev => prev.map(c => c.id === updated.id ? updated : c));
      setSaveMsg(aprobar ? "✓ Fórmula validada" : "✓ Cambios guardados");
    } catch {
      setSaveMsg("Error al guardar. Intenta de nuevo.");
    }
    setSaving(false);
  }

  function logout() {
    setOptometrista(null);
    setCasos([]);
    setSelected(null);
    setView("login");
  }

  // ── Login ──────────────────────────────────────────────────────────────────
  if (view === "login") return (
    <div style={{ ...wrap, paddingTop: "3rem", textAlign: "center" }}>
      <i className="ti ti-id-badge-2" style={{ fontSize: 36, color: "var(--color-text-tertiary)" }} aria-hidden="true" />
      <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "12px 0 4px" }}>Acceso optómetra</p>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.5rem" }}>Ingresa tu código secreto</p>
      <input
        type="text"
        placeholder="OPT-NOMBRE-2025"
        value={code}
        onChange={e => setCode(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") login(); }}
        style={{ ...input, textAlign: "center", letterSpacing: 2, marginBottom: 8 }}
      />
      {loginError && <p style={{ fontSize: 12, color: "var(--color-text-danger)", margin: "0 0 8px" }}>{loginError}</p>}
      <button style={{ ...btnP, marginBottom: 8, opacity: loading ? 0.6 : 1 }} onClick={login} disabled={loading}>
        {loading ? "Verificando..." : "Entrar"}
      </button>
      <button style={btnS} onClick={onExit}>Volver</button>
    </div>
  );

  // ── Dashboard ──────────────────────────────────────────────────────────────
  if (view === "dashboard") {
    const filtrados = filtro === "todos" ? casos : casos.filter(c => c.estadoValidacion === filtro);
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 2px", fontWeight: 500, letterSpacing: ".06em" }}>PANEL OPTÓMETRA</p>
            <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>{optometrista.nombre}</h2>
          </div>
          <button onClick={logout} style={{ ...btnS, width: "auto", padding: "7px 12px", fontSize: 12 }}>Salir</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: "1rem", flexWrap: "wrap" }}>
          {[["en revision","Por revisar"], ["validada","Validadas"], ["todos","Todos"]].map(([val, lbl]) => (
            <button key={val} onClick={() => setFiltro(val)}
              style={{ padding: "5px 10px", fontSize: 11, borderRadius: 20, cursor: "pointer", fontWeight: filtro === val ? 500 : 400,
                background: filtro === val ? "var(--color-text-primary)" : "var(--color-background-secondary)",
                color:      filtro === val ? "var(--color-background-primary)" : "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-secondary)" }}>
              {lbl}
            </button>
          ))}
        </div>

        {filtrados.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-tertiary)", fontSize: 13 }}>
            No hay casos en esta categoría.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtrados.map(ev => {
              const rk = getRisk(ev.leftRed, ev.rightRed, ev.asym, ev.qScore);
              const vc = VALIDACION_INFO[ev.estadoValidacion] || VALIDACION_INFO["pendiente"];
              return (
                <button key={ev.id} onClick={() => abrirCaso(ev)}
                  style={{ textAlign: "left", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px", background: "var(--color-background-primary)", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px" }}>{ev.nombre}</p>
                      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>{ev.fecha}</p>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 20, background: rk.bc, color: rk.tc, whiteSpace: "nowrap" }}>
                      {ev.overall}/100
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 6, fontSize: 11, color: "var(--color-text-secondary)", flexWrap: "wrap", alignItems: "center" }}>
                    {ev.cedula && <span>CC {ev.cedula}</span>}
                    <span style={{ padding: "1px 6px", borderRadius: 10, background: rk.bc, color: rk.tc }}>{ev.riesgo}</span>
                    <span style={{ padding: "1px 6px", borderRadius: 10, background: vc.bg, color: vc.c }}>{vc.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Caso (detalle + fórmula) ─────────────────────────────────────────────────
  if (view === "caso" && selected) {
    const rk = getRisk(selected.leftRed, selected.rightRed, selected.asym, selected.qScore);
    const vc = VALIDACION_INFO[selected.estadoValidacion] || VALIDACION_INFO["pendiente"];
    return (
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
          <button onClick={() => setView("dashboard")} style={{ ...btnS, width: "auto", padding: "7px 14px", fontSize: 13 }}>← Volver</button>
          <span style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 20, background: vc.bg, color: vc.c }}>{vc.label}</span>
        </div>

        <div style={card}>
          <p style={sectionTitle}>DATOS DEL PACIENTE</p>
          <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>{selected.nombre}</p>
          <div style={{ display: "flex", gap: 6, fontSize: 12, color: "var(--color-text-secondary)", flexWrap: "wrap" }}>
            {selected.cedula  && <span>CC {selected.cedula}</span>}
            {selected.celular && <span>· {selected.celular}</span>}
            {selected.correo  && <span>· {selected.correo}</span>}
          </div>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "6px 0 0" }}>{selected.fecha}</p>
        </div>

        {(HC_QUESTIONS.some(q => selected[q.key]) || selected.hcUltimaFormula) && (
          <div style={card}>
            <p style={sectionTitle}>HISTORIA CLÍNICA</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {HC_QUESTIONS.filter(q => selected[q.key]).map(q => (
                <div key={q.key} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{q.text}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", textAlign: "right", maxWidth: "55%" }}>{selected[q.key]}</span>
                </div>
              ))}
              {selected.hcUltimaFormula && (
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Última fórmula óptica</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", textAlign: "right", maxWidth: "55%" }}>{selected.hcUltimaFormula}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={card}>
          <p style={sectionTitle}>RESULTADOS VISUALES</p>
          <div style={{ marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 500, padding: "3px 8px", borderRadius: 20, background: rk.bc, color: rk.tc }}>
              {rk.label} · {selected.overall}/100
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[
              { l: "Enrojec. ojo izq.",   v: selected.leftRed },
              { l: "Enrojec. ojo der.",   v: selected.rightRed },
              { l: "Asimetría ocular",    v: selected.asym },
              { l: "Síntomas reportados", v: selected.qScore },
            ].map(({ l, v }) => (
              <div key={l} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "8px 10px" }}>
                <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: "0 0 2px" }}>{l}</p>
                <p style={{ fontSize: 16, fontWeight: 500, color: "var(--color-text-primary)", margin: 0 }}>{v}<span style={{ fontSize: 10, color: "var(--color-text-tertiary)" }}>/100</span></p>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {VT_TESTS.filter(t => selected[t.key]).map(({ key, label }) => {
              const status = selected.vtStatus?.[key] || "gray";
              const sc = SEMAFORO_INFO[status];
              return (
                <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--color-text-secondary)" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: sc.c, flexShrink: 0 }} />
                    {label}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: sc.c, textAlign: "right", maxWidth: "55%" }}>{selected[key]}</span>
                </div>
              );
            })}
            {VT_TESTS.every(t => !selected[t.key]) && (
              <p style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: 0 }}>Sin pruebas registradas</p>
            )}
          </div>
        </div>

        <div style={card}>
          <p style={sectionTitle}>FÓRMULA MÉDICA</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {[
              { side: "Od", title: "Ojo Derecho (OD)" },
              { side: "Oi", title: "Ojo Izquierdo (OI)" },
            ].map(({ side, title }) => (
              <div key={side}>
                <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>{title}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {FORMULA_FIELDS.map(f => {
                    const key = `${f.key}${side}`;
                    return (
                      <div key={key}>
                        <label style={label}>{f.label}</label>
                        <input
                          type="number"
                          step={f.step}
                          min={f.min}
                          max={f.max}
                          value={form[key]}
                          onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                          style={input}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12 }}>
            <label style={label}>Observaciones (opcional)</label>
            <textarea
              value={form.observaciones}
              onChange={e => setForm(prev => ({ ...prev, observaciones: e.target.value }))}
              rows={3}
              style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
            />
          </div>
        </div>

        {saveMsg && (
          <p style={{ fontSize: 12, color: saveMsg.startsWith("✓") ? "var(--color-text-success)" : "var(--color-text-danger)", margin: "0 0 8px", textAlign: "center" }}>
            {saveMsg}
          </p>
        )}
        <button style={{ ...btnS, marginBottom: 8, opacity: saving ? 0.6 : 1 }} onClick={() => guardar(false)} disabled={saving}>
          Guardar cambios
        </button>
        <button style={{ ...btnP, marginBottom: 8, opacity: saving ? 0.6 : 1 }} onClick={() => guardar(true)} disabled={saving}>
          Aprobar fórmula
        </button>
        {selected.estadoValidacion === "validada" && selected.celular && (
          <a
            href={`https://wa.me/57${selected.celular.replace(/\D/g,"")}?text=${encodeURIComponent(`Hola ${selected.nombre}, tu evaluación visual en VisualCheck fue validada por nuestro optómetra. Descarga tu reporte en visualcheck-neon.vercel.app`)}`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px", fontSize: 14, fontWeight: 500, background: "#25D366", color: "#fff", borderRadius: "var(--border-radius-md)", textDecoration: "none", boxSizing: "border-box" }}>
            <i className="ti ti-brand-whatsapp" aria-hidden="true" />
            Notificar al paciente por WhatsApp
          </a>
        )}
      </div>
    );
  }

  return null;
}
