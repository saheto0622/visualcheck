function fmt(n) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

export default function Cart({ cart, setCart, onCheckout, onContinueShopping }) {
  const subtotal = cart.reduce((s, i) => s + i.precio_total, 0);

  function eliminar(uid) {
    setCart((prev) => prev.filter((i) => i.uid !== uid));
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "1rem 1rem 4rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1.25rem" }}>
        <button
          onClick={onContinueShopping}
          style={{ padding: "7px 14px", fontSize: 13, cursor: "pointer", color: "var(--color-text-secondary)", background: "transparent", border: "0.5px solid var(--color-border-secondary)", borderRadius: "var(--border-radius-md)" }}>
          ← Seguir comprando
        </button>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 500, margin: 0, color: "var(--color-text-primary)" }}>Carrito</h2>
          <p style={{ fontSize: 11, color: "var(--color-text-tertiary)", margin: 0 }}>
            {cart.length === 0 ? "Vacío" : `${cart.length} ${cart.length === 1 ? "producto" : "productos"}`}
          </p>
        </div>
      </div>

      {cart.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--color-text-tertiary)" }}>
          <div style={{ fontSize: 48, marginBottom: "1rem" }}>🛍️</div>
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 8px" }}>Tu carrito está vacío</p>
          <p style={{ fontSize: 13, margin: "0 0 1.5rem" }}>Agrega monturas desde el catálogo</p>
          <button
            onClick={onContinueShopping}
            style={{ padding: "12px 28px", fontSize: 14, fontWeight: 500, cursor: "pointer", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)" }}>
            Ver catálogo
          </button>
        </div>
      ) : (
        <>
          {/* Lista de items */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: "1.25rem" }}>
            {cart.map((item) => (
              <div key={item.uid} style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "12px 14px", background: "var(--color-background-primary)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  {/* Mini imagen */}
                  <div style={{ width: 72, height: 40, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <img src={item.imagen_url} alt={item.montura} style={{ width: 68, height: 36, objectFit: "contain" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.montura}</p>
                    <p style={{ fontSize: 11, color: "var(--color-text-secondary)", margin: "0 0 1px" }}>{item.tipo_lente}</p>
                    {item.filtro_azul && (
                      <p style={{ fontSize: 10, color: "var(--color-text-info)", margin: "0 0 1px" }}>+ Filtro luz azul</p>
                    )}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", margin: "0 0 6px" }}>{fmt(item.precio_total)}</p>
                    <button
                      onClick={() => eliminar(item.uid)}
                      style={{ padding: "3px 8px", fontSize: 11, cursor: "pointer", color: "var(--color-text-danger)", background: "transparent", border: "0.5px solid var(--color-text-danger)", borderRadius: "var(--border-radius-md)" }}>
                      Eliminar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Subtotal */}
          <div style={{ border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "16px", marginBottom: "1rem", background: "var(--color-background-secondary)" }}>
            {cart.map((item) => (
              <div key={item.uid} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 4 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }}>{item.montura}</span>
                <span>{fmt(item.precio_total)}</span>
              </div>
            ))}
            <div style={{ borderTop: "0.5px solid var(--color-border-tertiary)", marginTop: 8, paddingTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>Subtotal</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: "var(--color-text-primary)" }}>{fmt(subtotal)}</span>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={onCheckout}
            style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 500, cursor: "pointer", background: "var(--color-text-primary)", color: "var(--color-background-primary)", border: "none", borderRadius: "var(--border-radius-md)" }}>
            Continuar a pago →
          </button>
        </>
      )}
    </div>
  );
}
