import { MercadoPagoConfig, Preference } from "mercadopago";
import { initializeApp, cert, getApps } from "firebase-admin/app";

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  } catch (error) {
    console.error("Erro Firebase:", error);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { userId, email, plan, method } = req.body;
  if (!userId || !plan || !method) {
    return res.status(400).json({ error: "Dados incompletos." });
  }

  const plans = {
    silver: { title: "Simulado PMPA - Plano Silver (3x/dia)", pix: 9.90 * 0.95, card: 9.90 },
    gold: { title: "Simulado PMPA - Plano Gold (Ilimitado)", pix: 19.90, card: 29.90 }
  };

  if (!plans[plan]) {
    return res.status(400).json({ error: "Plano inválido." });
  }

  const title = plans[plan].title;
  const price = method === "pix" ? plans[plan].pix : plans[plan].card;

  try {
    const preference = new Preference(client);

    const body = {
      items: [{ title, unit_price: Number(price.toFixed(2)), quantity: 1 }],
      payer: { email: email || "email@exemplo.com" },
      metadata: { user_id: userId, plan_type: plan },
      notification_url: `https://${req.headers.host}/api/webhook`,
      back_urls: {
        success: `https://${req.headers.host}/?status=approved`,
        failure: `https://${req.headers.host}/?status=failure`,
        pending: `https://${req.headers.host}/?status=pending`
      },
      auto_return: "approved",
      payment_methods: {
        excluded_payment_types: method === "pix" ? [] : [{ id: "pix" }],
        installments: 12
      }
    };

    const response = await preference.create({ body });

    return res.status(200).json({
      init_point: response.init_point,
      qr_code: response.point_of_interaction?.transaction_data?.qr_code || null,
      qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64 || null,
      id: response.id,
      price_charged: price.toFixed(2)
    });
  } catch (error) {
    console.error("Erro MercadoPago:", error);
    return res.status(500).json({ error: "Erro ao criar pagamento." });
  }
}