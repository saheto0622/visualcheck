// Llama a la función serverless /api/create-preference para generar
// la preferencia de MercadoPago desde el servidor (nunca expone el Access Token).
export async function crearPreferencia({ items, amount, orderId }) {
  const backUrl = window.location.origin + "/";

  const response = await fetch("/api/create-preference", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, amount, orderId, backUrl }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Error al crear preferencia de pago");
  }

  return response.json(); // { init_point: "https://..." }
}
