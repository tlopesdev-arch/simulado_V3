import { MercadoPagoConfig, Preference } from "mercadopago";
import { initializeApp, cert, getApps } from "firebase-admin/app";

// Inicializa Firebase Admin se não houver apps ativos
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  } catch (error) {
    console.error("Erro Firebase:", error);
  }
}

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { userId, email, plan, method } = req.body;

  // Definição das Regras de Preço (Conforme solicitado)
  const plans = {
    silver: {
      title: "Simulado PMPA - Plano Silver (3x/dia + Recursos)",
      // R$ 9,90 padrão, com 5% de desconto no PIX (~R$ 9,40)
      price: method === "pix" ? 9.90 * 0.95 : 9.90
    },
    gold: {
      title: "Simulado PMPA - Plano Gold (Ilimitado + Tudo)",
      // R$ 19,90 no PIX, R$ 29,90 no Cartão
      price: method === "pix" ? 19.90 : 29.90
    }
  };

  if (!plans[plan]) {
    return res.status(400).json({ error: "Plano inválido." });
  }

  const selectedPlan = plans[plan];

  try {
    const body = {
      items: [
        {
          title: selectedPlan.title,
          unit_price: Number(selectedPlan.price.toFixed(2)),
          quantity: 1,
          currency_id: "BRL"
        }
      ],
      payer: { email: email || "email@exemplo.com" },
      metadata: {
        user_id: userId,
        plan_type: plan // 'silver' ou 'gold'
      },
      // Ajusta URL dinamicamente baseado no host da Vercel
      notification_url: `https://${req.headers.host}/api/webhook`,
      back_urls: {
        success: `https://${req.headers.host}/`,
        failure: `https://${req.headers.host}/`
      },
      auto_return: "approved",
      payment_methods: {
        // Se for PIX, exclui boleto e cartão para simplificar a UX do MP
        // Se for Cartão, exclui boleto e pix
        excluded_payment_types: method === 'pix' 
            ? [{ id: "ticket" }, { id: "debit_card" }, { id: "credit_card" }]
            : [{ id: "ticket" }, { id: "pix" }],
        installments: 12
      }
    };

    const preference = new Preference(client);
    const response = await preference.create({ body });

    return res.status(200).json({
      init_point: response.init_point, // Link para Checkout Pro
      // Dados para PIX nativo (se disponível na resposta)
      qr_code: response.point_of_interaction?.transaction_data?.qr_code,
      qr_code_base64: response.point_of_interaction?.transaction_data?.qr_code_base64,
      id: response.id,
      price_charged: selectedPlan.price.toFixed(2)
    });

  } catch (error) {
    console.error("Erro MP:", error);
    return res.status(500).json({ error: "Erro ao criar pagamento." });
  }
}