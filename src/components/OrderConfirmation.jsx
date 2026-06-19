import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function OrderConfirmation({ paymentData, onGoHome }) {
  const { paymentStatus, orderId, collectionId } = paymentData || {};
  const [updating, setUpdating] = useState(false);

  const success = paymentStatus === "approved";
  const pending = paymentStatus === "pending";

  useEffect(() => {
    if (!orderId && !collectionId) return;
    setUpdating(true);
    const newEstado = success ? "pagado" : pending ? "pendiente_pago" : "pago_fallido";
    const updates = { estado: newEstado };
    if (collectionId) updates.mercadopago_payment_id = String(collectionId);

    supabase
      .from("pedidos")
      .update(updates)
      .eq("id", Number(orderId) || 0)
      .then(() => setUpdating(false))
      .catch(() => setUpdating(false));
  }, [orderId, collectionId, success, pending]);

  return (
    <div style={{ maxWidth: 460, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center" }}>
      {/* Ícono */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%", margin: "0 auto 1.5rem",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: success ? "var(--color-background-success)" : pending ? "var(--color-background-warning)" : "var(--color-background-danger)",
      }}>
        <span style={{ fontSize: 36 }}>{success ? "✓" : pending ? "⏳" : "✕"}</span>
      </div>

      <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 8px" }}>
        {success ? "¡Pedido confirmado!" : pending ? "Pago en proceso" : "Hubo un problema con el pago"}
      </h2>

      <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
        {success
          ? "Tu pedido ha sido recibido. Te contactaremos al número registrado para coordinar el despacho."
          : pending
          ? "Tu pago está siendo procesado. Te notificaremos cuando se confirme."
          : "No se pudo procesar tu pago. Por favor intenta de nuevo o usa otro método de pago."}
      </p>

      {(orderId) && (
        <div style={{ padding: "14px 20px", borderRadius: "var(--border-radius-lg)", background: "var(--color-background-secondary)", marginBottom: "1.5rem", display: "inline-block" }}>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: "0 0 2px" }}>Número de orden</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", margin: 0, letterSpacing: 1 }}>
            #{String(orderId).slice(-8)}
          </p>
        </div>
      )}

      {success && (
        <div style={{ padding: "12px 16px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-success)", border: "0.5px solid var(--color-text-success)", marginBottom: "1.5rem", textAlign: "left" }}>
          <p style={{ fontSize: 12, color: "var(--color-text-success)", margin: 0, lineHeight: 1.6 }}>
            Fabricación: <strong>5–7 días hábiles</strong> · Envío a domicilio en toda Colombia
          </p>
        </div>
      )}

      <button
        onClick={onGoHome}
        style={{ width: "100%", padding: "13px", fontSize: 14, fontWeight: 500, cursor: "pointer", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)" }}>
        Volver al inicio
      </button>

      {updating && (
        <p style={{ fontSize: 10, color: "var(--color-text-tertiary)", marginTop: 8 }}>Actualizando estado del pedido...</p>
      )}
    </div>
  );
}
