import { useState } from "react";
import { supabase } from "../lib/supabase";
import { crearPreferencia } from "../lib/mercadopago";
import { input } from "../lib/styles";

const COSTO_ENVIO_PARCIAL = 20000;
const RECARGO_CONTRAENTREGA = 0.07;

function fmt(n) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

export default function Checkout({ cart, userData, onBack, onGoToEval }) {
  const subtotal = cart.reduce((s, i) => s + i.precio_total, 0);

  // Estado del checkout multi-paso
  const [paso,        setPaso]        = useState(1);
  const [prescInfo,   setPrescInfo]   = useState(null);
  const [prescLoading,setPrescLoading]= useState(false);
  const [cedBusq,     setCedBusq]     = useState(userData?.cedula ?? "");
  const [envio,       setEnvio]       = useState({
    nombre:    userData?.nombre    ?? "",
    cedula:    userData?.cedula    ?? "",
    direccion: userData?.direccion ?? "",
    ciudad:    "",
    celular:   userData?.celular   ?? "",
  });
  const [tipoPago,    setTipoPago]    = useState("completo");
  const [pagando,     setPagando]     = useState(false);
  const [errorPago,   setErrorPago]   = useState("");

  // ── Cálculos de pago ────────────────────────────────────────────────────────
  const montoCompleto = subtotal;
  const monto50       = Math.round(subtotal * 0.5);
  const saldoConRecargo = Math.round(monto50 * (1 + RECARGO_CONTRAENTREGA)) + COSTO_ENVIO_PARCIAL;

  // ── Paso 1: Prescripción ───────────────────────────────────────────────────
  async function buscarPrescripcion() {
    if (!cedBusq.trim()) return;
    setPrescLoading(true);
    try {
      const { data } = await supabase
        .from("evaluaciones")
        .select("id, nombre, cedula, estado_validacion, optometrista_nombre, esfera_od, cilindro_od, eje_od, esfera_oi, cilindro_oi, eje_oi, adicion")
        .eq("cedula", cedBusq.trim())
        .eq("estado_validacion", "validada")
        .order("id", { ascending: false })
        .limit(1);
      setPrescInfo(data?.[0] ?? null);
    } catch {
      setPrescInfo(null);
    }
    setPrescLoading(false);
  }

  // ── Paso 4: Pagar ──────────────────────────────────────────────────────────
  async function handlePagar() {
    setPagando(true);
    setErrorPago("");
    try {
      const orderId = Date.now();
      const monto = tipoPago === "completo" ? montoCompleto : monto50;

      // Guardar pedido en Supabase con estado pendiente_pago
      const pedidoData = {
        id: orderId,
        fecha: new Date().toISOString(),
        nombre:   envio.nombre,
        cedula:   envio.cedula,
        direccion: envio.direccion,
        ciudad:   envio.ciudad,
        celular:  envio.celular,
        items: cart.map((i) => ({
          montura:     i.montura,
          montura_id:  i.montura_id,
          tipo_lente:  i.tipo_lente,
          filtro_azul: i.filtro_azul,
          precio:      i.precio_total,
        })),
        subtotal,
        tipo_pago:          tipoPago,
        monto_pagado_mp:    monto,
        saldo_pendiente:    tipoPago === "completo" ? 0 : saldoConRecargo,
        costo_envio:        tipoPago === "completo" ? 0 : COSTO_ENVIO_PARCIAL,
        estado:             "pendiente_pago",
        evaluacion_id:      prescInfo?.id ?? null,
      };

      await supabase.from("pedidos").insert(pedidoData);

      // Crear preferencia de MercadoPago
      const mpItems = cart.map((i) => ({
        title: `${i.montura} - ${i.tipo_lente}`,
        quantity: 1,
        unit_price: tipoPago === "completo" ? i.precio_total : Math.round(i.precio_total * 0.5),
      }));

      const { init_point } = await crearPreferencia({ items: mpItems, amount: monto, orderId });
      window.location.href = init_point;
    } catch (err) {
      setErrorPago(err.message || "Error al procesar el pago. Intenta de nuevo.");
      setPagando(false);
    }
  }

  // ── UI ──────────────────────────────────────────────────────────────────────
  const envioValido = envio.nombre.trim().length > 1 && envio.celular.trim().length > 6 && envio.direccion.trim().length > 3 && envio.ciudad.trim().length > 1;

  const StepIndicator = () => (
    <div style={{ display: "flex", gap: 0, marginBottom: "1.5rem", borderRadius: "var(--border-radius-md)", overflow: "hidden", border: "0.5px solid var(--color-border-secondary)" }}>
      {["Fórmula", "Envío", "Pago", "Confirmar"].map((label, i) => (
        <div key={i} style={{ flex: 1, padding: "8px 4px", textAlign: "center", fontSize: 10, fontWeight: paso === i + 1 ? 600 : 400, background: paso === i + 1 ? "var(--color-text-primary)" : paso > i + 1 ? "var(--color-background-success)" : "var(--color-background-secondary)", color: paso === i + 1 ? "var(--color-background-primary)" : paso > i + 1 ? "var(--color-text-success)" : "var(--color-text-tertiary)", borderRight: i < 3 ? "0.5px solid var(--color-border-secondary)" : "none" }}>
          {paso > i + 1 ? "✓" : label}
        </div>
      ))}
    </div>
  );

  // PASO 1 — FÓRMULA
  if (paso === 1) return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 4rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
        <button onClick={onBack} style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--color-text-secondary)", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>← Carrito</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Checkout</h2>
      </div>
      <StepIndicator />

      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>Fórmula óptica</p>
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1.25rem", lineHeight: 1.55 }}>
        Si tienes una evaluación validada por un optómetra en VisualCheck, la usaremos para fabricar tus lentes.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
        <input
          type="text"
          placeholder="Tu número de cédula"
          value={cedBusq}
          onChange={(e) => setCedBusq(e.target.value)}
          style={{ ...input, flex: 1 }}
        />
        <button
          onClick={buscarPrescripcion}
          disabled={prescLoading || !cedBusq.trim()}
          style={{ padding: "11px 16px", fontSize: 13, cursor: "pointer", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", opacity: cedBusq.trim() ? 1 : 0.4 }}>
          {prescLoading ? "..." : "Buscar"}
        </button>
      </div>

      {prescInfo && (
        <div style={{ padding: "14px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-success)", border: "0.5px solid var(--color-text-success)", marginBottom: "1rem" }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-success)", margin: "0 0 6px" }}>✓ Fórmula validada encontrada</p>
          <p style={{ fontSize: 12, color: "var(--color-text-success)", margin: "0 0 2px" }}>Validada por: {prescInfo.optometrista_nombre ?? "Optómetra VisualCheck"}</p>
          <p style={{ fontSize: 11, color: "var(--color-text-success)", margin: 0, opacity: 0.85 }}>
            OD: {prescInfo.esfera_od ?? "—"} / {prescInfo.cilindro_od ?? "—"} / {prescInfo.eje_od ?? "—"}° · OI: {prescInfo.esfera_oi ?? "—"} / {prescInfo.cilindro_oi ?? "—"} / {prescInfo.eje_oi ?? "—"}°
          </p>
        </div>
      )}

      {prescInfo === null && cedBusq && !prescLoading && (
        <div style={{ padding: "14px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-warning)", border: "0.5px solid var(--color-text-warning)", marginBottom: "1rem" }}>
          <p style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-warning)", margin: "0 0 4px" }}>No encontramos una fórmula validada con esa cédula</p>
          <p style={{ fontSize: 11, color: "var(--color-text-warning)", margin: "0 0 8px", lineHeight: 1.5 }}>
            Recomendamos hacer tu evaluación visual primero para que un optómetra valide tu fórmula.
          </p>
          <button
            onClick={onGoToEval}
            style={{ padding: "7px 14px", fontSize: 12, cursor: "pointer", background: "var(--color-text-warning)", color: "#fff", border: "none", borderRadius: "var(--border-radius-md)", fontWeight: 500 }}>
            Hacer evaluación gratuita
          </button>
        </div>
      )}

      <div style={{ padding: "12px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", marginBottom: "1.5rem", fontSize: 12, color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
        Puedes continuar sin fórmula validada para comprar monturas con lentes sin prescripción (planos).
      </div>

      <button
        onClick={() => setPaso(2)}
        style={{ width: "100%", padding: "13px", fontSize: 14, fontWeight: 500, cursor: "pointer", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)" }}>
        Continuar →
      </button>
    </div>
  );

  // PASO 2 — DATOS DE ENVÍO
  if (paso === 2) return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 4rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
        <button onClick={() => setPaso(1)} style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--color-text-secondary)", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>← Atrás</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Datos de envío</h2>
      </div>
      <StepIndicator />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.5rem" }}>
        {[
          { key: "nombre",    label: "Nombre completo *", type: "text",  ph: "Tu nombre y apellido" },
          { key: "cedula",    label: "Cédula *",           type: "text",  ph: "Número de cédula" },
          { key: "direccion", label: "Dirección *",         type: "text",  ph: "Calle, número, barrio" },
          { key: "ciudad",    label: "Ciudad *",            type: "text",  ph: "Ej: Medellín" },
          { key: "celular",   label: "Celular *",           type: "tel",   ph: "3XX XXX XXXX" },
        ].map(({ key, label, type, ph }) => (
          <div key={key}>
            <label style={{ fontSize: 12, color: "var(--color-text-secondary)", display: "block", marginBottom: 5, fontWeight: 500 }}>{label}</label>
            <input
              type={type}
              placeholder={ph}
              value={envio[key]}
              onChange={(e) => setEnvio((p) => ({ ...p, [key]: e.target.value }))}
              style={input}
            />
          </div>
        ))}
      </div>

      <button
        disabled={!envioValido}
        onClick={() => setPaso(3)}
        style={{ width: "100%", padding: "13px", fontSize: 14, fontWeight: 500, cursor: envioValido ? "pointer" : "not-allowed", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)", opacity: envioValido ? 1 : 0.4 }}>
        Continuar →
      </button>
    </div>
  );

  // PASO 3 — OPCIÓN DE PAGO
  if (paso === 3) return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 4rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
        <button onClick={() => setPaso(2)} style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--color-text-secondary)", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>← Atrás</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Opción de pago</h2>
      </div>
      <StepIndicator />

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: "1.5rem" }}>
        {/* Pago completo */}
        <button
          onClick={() => setTipoPago("completo")}
          style={{ textAlign: "left", padding: "16px", border: tipoPago === "completo" ? "1.5px solid var(--color-text-success)" : "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-lg)", background: tipoPago === "completo" ? "var(--color-background-success)" : "var(--color-background-primary)", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: tipoPago === "completo" ? "var(--color-text-success)" : "var(--color-text-primary)", margin: "0 0 2px" }}>Pago completo (100%)</p>
              <p style={{ fontSize: 11, color: tipoPago === "completo" ? "var(--color-text-success)" : "var(--color-text-secondary)", margin: 0 }}>Envío GRATIS</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: tipoPago === "completo" ? "var(--color-text-success)" : "var(--color-text-primary)", margin: 0 }}>{fmt(montoCompleto)}</p>
              <p style={{ fontSize: 10, color: tipoPago === "completo" ? "var(--color-text-success)" : "var(--color-text-tertiary)", margin: 0 }}>Total a pagar hoy</p>
            </div>
          </div>
        </button>

        {/* Pago 50% */}
        <button
          onClick={() => setTipoPago("parcial")}
          style={{ textAlign: "left", padding: "16px", border: tipoPago === "parcial" ? "1.5px solid var(--color-text-info)" : "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-lg)", background: tipoPago === "parcial" ? "var(--color-background-info)" : "var(--color-background-primary)", cursor: "pointer" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: tipoPago === "parcial" ? "var(--color-text-info)" : "var(--color-text-primary)", margin: "0 0 2px" }}>Pago 50% ahora</p>
              <p style={{ fontSize: 11, color: tipoPago === "parcial" ? "var(--color-text-info)" : "var(--color-text-secondary)", margin: 0 }}>Resto contraentrega</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 18, fontWeight: 700, color: tipoPago === "parcial" ? "var(--color-text-info)" : "var(--color-text-primary)", margin: 0 }}>{fmt(monto50)}</p>
              <p style={{ fontSize: 10, color: tipoPago === "parcial" ? "var(--color-text-info)" : "var(--color-text-tertiary)", margin: 0 }}>Pagas hoy</p>
            </div>
          </div>
          <div style={{ borderTop: `0.5px solid ${tipoPago === "parcial" ? "rgba(0,120,200,0.3)" : "var(--color-border-tertiary)"}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: tipoPago === "parcial" ? "var(--color-text-info)" : "var(--color-text-secondary)" }}>
              <span>Saldo restante (50%)</span><span>{fmt(monto50)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: tipoPago === "parcial" ? "var(--color-text-info)" : "var(--color-text-secondary)" }}>
              <span>Recargo contraentrega (7%)</span><span>+{fmt(Math.round(monto50 * RECARGO_CONTRAENTREGA))}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: tipoPago === "parcial" ? "var(--color-text-info)" : "var(--color-text-secondary)" }}>
              <span>Envío</span><span>+{fmt(COSTO_ENVIO_PARCIAL)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 600, color: tipoPago === "parcial" ? "var(--color-text-info)" : "var(--color-text-primary)", marginTop: 3 }}>
              <span>Total a pagar al recibir</span><span>{fmt(saldoConRecargo)}</span>
            </div>
          </div>
        </button>
      </div>

      <button
        onClick={() => setPaso(4)}
        style={{ width: "100%", padding: "13px", fontSize: 14, fontWeight: 500, cursor: "pointer", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)" }}>
        Continuar →
      </button>
    </div>
  );

  // PASO 4 — CONFIRMAR Y PAGAR
  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 4rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
        <button onClick={() => setPaso(3)} style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--color-text-secondary)", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>← Atrás</button>
        <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Confirmar pedido</h2>
      </div>
      <StepIndicator />

      {/* Resumen */}
      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1rem" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 10px", letterSpacing: ".05em" }}>RESUMEN DEL PEDIDO</p>
        {cart.map((item) => (
          <div key={item.uid} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
            <span style={{ maxWidth: "65%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.montura} – {item.tipo_lente}{item.filtro_azul ? " + Azul" : ""}</span>
            <span>{fmt(item.precio_total)}</span>
          </div>
        ))}
        <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", marginTop: 8, paddingTop: 8, display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)" }}>
          <span>Subtotal</span><span>{fmt(subtotal)}</span>
        </div>
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1rem" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 8px", letterSpacing: ".05em" }}>ENVÍO A</p>
        <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px" }}>{envio.nombre}</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: "0 0 1px" }}>{envio.direccion}, {envio.ciudad}</p>
        <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>{envio.celular}</p>
      </div>

      <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px", marginBottom: "1.5rem", background: "var(--color-background-secondary)" }}>
        <p style={{ fontSize: 11, fontWeight: 500, color: "var(--color-text-tertiary)", margin: "0 0 8px", letterSpacing: ".05em" }}>PAGO</p>
        {tipoPago === "completo" ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}><span>Envío</span><span style={{ color: "var(--color-text-success)", fontWeight: 500 }}>GRATIS</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)" }}><span>Total a pagar hoy</span><span>{fmt(montoCompleto)}</span></div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}><span>Pagas hoy (50%)</span><span>{fmt(monto50)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 2 }}><span>Envío</span><span>+{fmt(COSTO_ENVIO_PARCIAL)}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}><span>Total a pagar al recibir</span><span style={{ fontWeight: 600 }}>{fmt(saldoConRecargo)}</span></div>
          </>
        )}
      </div>

      {errorPago && (
        <div style={{ padding: "12px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-danger)", marginBottom: "1rem" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-danger)", margin: 0 }}>{errorPago}</p>
        </div>
      )}

      <button
        onClick={handlePagar}
        disabled={pagando}
        style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 600, cursor: pagando ? "not-allowed" : "pointer", background: pagando ? "var(--color-background-secondary)" : "#009EE3", color: pagando ? "var(--color-text-tertiary)" : "#fff", border: "none", borderRadius: "var(--border-radius-md)", transition: "background 0.2s" }}>
        {pagando ? "Redirigiendo a MercadoPago..." : "Pagar con MercadoPago"}
      </button>
      <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", textAlign: "center", marginTop: 8 }}>
        Serás redirigido a la plataforma segura de MercadoPago
      </p>
    </div>
  );
}
