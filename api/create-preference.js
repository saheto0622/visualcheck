// Vercel Serverless Function — NUNCA exponer MP_ACCESS_TOKEN en el cliente.
// Configurar en Vercel: Settings → Environment Variables → MP_ACCESS_TOKEN
import { MercadoPagoConfig, Preference } from "mercadopago";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    return res.status(500).json({ error: "MP_ACCESS_TOKEN no configurado en variables de entorno" });
  }

  try {
    const { items, orderId, backUrl } = req.body;

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const result = await preference.create({
      body: {
        items: (items || []).map((item) => ({
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
      },
    });

    return res.status(200).json({ init_point: result.init_point });
  } catch (err) {
    console.error("MercadoPago error:", err);
    return res.status(500).json({ error: err.message || "Error al crear preferencia" });
  }
}
