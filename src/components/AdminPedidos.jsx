import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { btnS } from "../lib/styles";

const ESTADOS = ["pendiente_pago", "pagado_parcial", "pagado_completo", "en_produccion", "enviado", "entregado"];

const ESTADO_COLORS = {
  pendiente_pago:   { bg: "var(--color-background-secondary)", c: "var(--color-text-tertiary)" },
  pagado_parcial:   { bg: "var(--color-background-warning)",   c: "var(--color-text-warning)" },
  pagado_completo:  { bg: "var(--color-background-info)",      c: "var(--color-text-info)" },
  en_produccion:    { bg: "rgba(138,43,226,0.1)",              c: "#8A2BE2" },
  enviado:          { bg: "var(--color-background-warning)",   c: "var(--color-text-warning)" },
  entregado:        { bg: "var(--color-background-success)",   c: "var(--color-text-success)" },
};

const ESTADO_LABELS = {
  pendiente_pago:  "Pendiente pago",
  pagado_parcial:  "Pagado 50%",
  pagado_completo: "Pagado 100%",
  en_produccion:   "En producción",
  enviado:         "Enviado",
  entregado:       "Entregado",
};

const FILTROS = [
  { val: "todos",          label: "Todos" },
  { val: "pendiente_pago", label: "Pendiente pago" },
  { val: "pagado_parcial", label: "Pagado 50%" },
  { val: "en_produccion",  label: "En producción" },
  { val: "enviado",        label: "Enviados" },
  { val: "entregado",      label: "Entregados" },
];

function fmt(n) {
  if (!n) return "—";
  return Number(n).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

export default function AdminPedidos({ onBack }) {
  const [pedidos,  setPedidos]  = useState([]);
  const [filtro,   setFiltro]   = useState("todos");
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    cargarPedidos();
  }, []);

  async function cargarPedidos() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("pedidos")
        .select("*")
        .order("id", { ascending: false });
      setPedidos(data || []);
    } catch {
      setPedidos([]);
    }
    setLoading(false);
  }

  async function cambiarEstado(id, estado) {
    try {
      await supabase.from("pedidos").update({ estado }).eq("id", id);
      setPedidos((prev) => prev.map((p) => (p.id === id ? { ...p, estado } : p)));
    } catch (e) {
      console.error("cambiar estado:", e);
    }
  }

  const filtrados = pedidos.filter((p) => filtro === "todos" || p.estado === filtro);

  const resumen = {
    total:        pedidos.length,
    porEnviar:    pedidos.filter((p) => p.estado === "pagado_completo" || p.estado === "pagado_parcial").length,
    enProd:       pedidos.filter((p) => p.estado === "en_produccion").length,
    enviados:     pedidos.filter((p) => p.estado === "enviado").length,
  };

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 2rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ ...btnS, width: "auto", padding: "7px 12px", fontSize: 12 }}>← Volver</button>
          <div>
            <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 2px", fontWeight: 500, letterSpacing: ".06em" }}>PANEL ADMIN</p>
            <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Pedidos</h2>
          </div>
        </div>
        <button onClick={cargarPedidos} style={{ ...btnS, width: "auto", padding: "7px 12px", fontSize: 12 }}>
          Actualizar
        </button>
      </div>

      {/* Stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: "1.25rem" }}>
        {[
          { label: "Total",      val: resumen.total,     c: "var(--color-text-primary)" },
          { label: "Por enviar", val: resumen.porEnviar, c: "var(--color-text-warning)" },
          { label: "Producción", val: resumen.enProd,    c: "#8A2BE2" },
          { label: "Enviados",   val: resumen.enviados,  c: "var(--color-text-info)" },
        ].map(({ label, val, c }) => (
          <div key={label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "10px 6px", textAlign: "center" }}>
            <p style={{ fontSize: 20, fontWeight: 600, color: c, margin: "0 0 2px" }}>{val}</p>
            <p style={{ fontSize: 9, color: "var(--color-text-tertiary)", margin: 0 }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: "flex", gap: 6, marginBottom: "1.25rem", flexWrap: "wrap" }}>
        {FILTROS.map(({ val, label }) => (
          <button key={val} onClick={() => setFiltro(val)}
            style={{ padding: "5px 10px", fontSize: 10, borderRadius: 20, cursor: "pointer",
              fontWeight: filtro === val ? 500 : 400,
              background: filtro === val ? "var(--color-text-primary)" : "var(--color-background-secondary)",
              color: filtro === val ? "var(--color-background-primary)" : "var(--color-text-secondary)",
              border: "0.5px solid var(--color-border-secondary)" }}>
            {label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)", fontSize: 13 }}>Cargando pedidos...</div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: "center", padding: "2rem", color: "var(--color-text-tertiary)", fontSize: 13 }}>
          {pedidos.length === 0 ? "Aún no hay pedidos registrados." : "No hay pedidos con este filtro."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtrados.map((ped) => {
            const ec = ESTADO_COLORS[ped.estado] || ESTADO_COLORS.pendiente_pago;
            const isOpen = expanded === ped.id;
            const items = Array.isArray(ped.items) ? ped.items : (typeof ped.items === "string" ? JSON.parse(ped.items) : []);

            return (
              <div key={ped.id} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", background: "var(--color-background-primary)" }}>
                {/* Cabecera del pedido */}
                <button
                  onClick={() => setExpanded(isOpen ? null : ped.id)}
                  style={{ width: "100%", textAlign: "left", padding: "12px 14px", background: "transparent", border: "none", cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px" }}>{ped.nombre ?? "—"}</p>
                      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 4px" }}>
                        #{String(ped.id).slice(-8)} · {ped.cedula ?? "—"} · {ped.celular ?? "—"}
                      </p>
                      <span style={{ fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 20, background: ec.bg, color: ec.c }}>
                        {ESTADO_LABELS[ped.estado] ?? ped.estado}
                      </span>
                      {ped.evaluacion_id && (
                        <span style={{ marginLeft: 6, fontSize: 10, padding: "2px 8px", borderRadius: 20, background: "var(--color-background-success)", color: "var(--color-text-success)" }}>
                          Con fórmula validada
                        </span>
                      )}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: "var(--color-text-primary)", margin: "0 0 2px" }}>{fmt(ped.subtotal)}</p>
                      <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", margin: 0 }}>
                        {ped.tipo_pago === "parcial" ? "50% hoy" : "Pago completo"}
                      </p>
                    </div>
                  </div>
                </button>

                {/* Detalle expandido */}
                {isOpen && (
                  <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", padding: "12px 14px" }}>
                    {/* Items */}
                    <p style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 6px", letterSpacing: ".05em" }}>PRODUCTOS</p>
                    {items.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 3 }}>
                        <span>{item.montura} – {item.tipo_lente}{item.filtro_azul ? " + Azul" : ""}</span>
                        <span>{fmt(item.precio)}</span>
                      </div>
                    ))}

                    {/* Datos de envío */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                      <p style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 4px", letterSpacing: ".05em" }}>ENVÍO</p>
                      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1px" }}>{ped.direccion}, {ped.ciudad}</p>
                      {ped.saldo_pendiente > 0 && (
                        <p style={{ fontSize: 12, color: "var(--color-text-warning)", margin: "4px 0 0", fontWeight: 500 }}>
                          Cobrar al entregar: {fmt(ped.saldo_pendiente)}
                        </p>
                      )}
                    </div>

                    {/* Cambiar estado */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "0.5px solid var(--color-border-tertiary)" }}>
                      <p style={{ fontSize: 10, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 6px", letterSpacing: ".05em" }}>CAMBIAR ESTADO</p>
                      <select
                        value={ped.estado}
                        onChange={(e) => cambiarEstado(ped.id, e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", fontSize: 12, borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: ec.bg, color: ec.c, cursor: "pointer" }}>
                        {ESTADOS.map((s) => (
                          <option key={s} value={s}>{ESTADO_LABELS[s] ?? s}</option>
                        ))}
                      </select>
                    </div>

                    {ped.mercadopago_payment_id && (
                      <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 8 }}>
                        MP ID: {ped.mercadopago_payment_id}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
