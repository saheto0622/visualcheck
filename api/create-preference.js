// Vercel Serverless Function — NUNCA exponer MP_ACCESS_TOKEN en el cliente.
// Configurar en Vercel: Settings → Environment Variables → MP_ACCESS_TOKEN
import { MercadoPagoConfig, Preference } from "mercadopago";

export default async function handler(req, res) {
  // ── CORS: permitir llamadas desde el mismo dominio o localhost ──────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // ── Verificar token ────────────────────────────────────────────────────
  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error("[MP] FATAL: MP_ACCESS_TOKEN no está definido en el entorno");
    return res
      .status(500)
      .json({ error: "MP_ACCESS_TOKEN no configurado en variables de entorno" });
  }

  // Log parcial del token para confirmar que se está leyendo (nunca loguear completo)
  const tokenPreview = `${accessToken.slice(0, 8)}...${accessToken.slice(-6)}`;
  const tokenType = accessToken.startsWith("APP_USR-")
    ? "producción"
    : accessToken.startsWith("TEST-")
    ? "TEST (no válido para producción)"
    : "desconocido";
  console.log(`[MP] Token leído: ${tokenPreview} | Tipo detectado: ${tokenType}`);

  // ── Parsear body ───────────────────────────────────────────────────────
  const { items, orderId, backUrl } = req.body || {};
  console.log("[MP] Body recibido:", JSON.stringify({ items, orderId, backUrl }));

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "El campo 'items' es requerido y no puede estar vacío" });
  }

  // ── Construir preferencia ──────────────────────────────────────────────
  const preferenceBody = {
    items: items.map((item) => ({
      id: String(item.id || item.title).slice(0, 256),
      title: String(item.title).slice(0, 256),
      quantity: Number(item.quantity) || 1,
      unit_price: Number(item.unit_price),
      currency_id: "COP",
    })),
    back_urls: {
      success: `${backUrl}?payment_status=approved&order_id=${orderId}`,
      failure: `${backUrl}?payment_status=failure&order_id=${orderId}`,
      pending: `${backUrl}?payment_status=pending&order_id=${orderId}`,
    },
    auto_return: "approved",
    external_reference: String(orderId),
    statement_descriptor: "VisualCheck Optica",
  };

  console.log("[MP] Preferencia a enviar:", JSON.stringify(preferenceBody));

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);
    const result = await preference.create({ body: preferenceBody });

    console.log("[MP] Preferencia creada OK. id:", result.id);
    return res.status(200).json({ init_point: result.init_point, id: result.id });
  } catch (err) {
    // El SDK v3 expone el detalle real en err.cause (array) y err.status
    const mpCause = err.cause ?? err.error_cause ?? null;
    const mpStatus = err.status ?? err.statusCode ?? null;

    console.error("[MP] Error al crear preferencia:", {
      message: err.message,
      status: mpStatus,
      cause: mpCause,
      // Serializar el error completo por si el SDK cambia la estructura
      raw: JSON.stringify(err, Object.getOwnPropertyNames(err)),
    });

    const causeDescription = Array.isArray(mpCause)
      ? mpCause.map((c) => c.description || c.message || JSON.stringify(c)).join("; ")
      : mpCause
      ? String(mpCause)
      : null;

    return res.status(mpStatus || 500).json({
      error: causeDescription || err.message || "Error al crear preferencia de pago",
      mp_status: mpStatus,
      mp_cause: mpCause,
      token_type: tokenType,
    });
  }
}
