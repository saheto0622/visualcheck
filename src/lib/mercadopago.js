// Llama a la función serverless /api/create-preference para generar
// la preferencia de MercadoPago desde el servidor (nunca expone el Access Token).
export async function crearPreferencia({ items, amount, orderId }) {
  const backUrl = window.location.origin + "/";

  const response = await fetch("/api/create-preference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, amount, orderId, backUrl }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    // Construir mensaje de error con el máximo detalle disponible
    const detail = data.mp_cause
      ? ` (MP ${data.mp_status}: ${JSON.stringify(data.mp_cause)})`
      : data.token_type
      ? ` [Token tipo: ${data.token_type}]`
      : "";
    throw new Error((data.error || "Error al crear preferencia de pago") + detail);
  }

  return data; // { init_point: "https://...", id: "..." }
}
