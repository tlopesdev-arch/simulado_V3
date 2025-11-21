import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { MercadoPagoConfig, Payment } from "mercadopago";

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    console.error("Erro Firebase:", err);
  }
}

const db = getFirestore();
const client = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { type, data } = req.body;
  // O MP envia o ID de várias formas dependendo da versão do webhook (topic vs type)
  const id = data?.id || req.query?.id || req.query?.['data.id'];

  // Filtra apenas eventos de pagamento
  if ((type === "payment" || req.query?.topic === "payment") && id) {
    try {
      const payment = new Payment(client);
      const paymentInfo = await payment.get({ id });

      if (paymentInfo.status === "approved") {
        const userId = paymentInfo.metadata.user_id;
        const planType = paymentInfo.metadata.plan_type; // 'silver' ou 'gold'

        if (userId && planType) {
          console.log(`Aprovado: ${planType} para ${userId}`);
          
          // Grava no Firestore
          await db.collection("artifacts").doc("default-app-id")
            .collection("users").doc(userId)
            .collection("profile").doc("data")
            .set({
              subscription: planType, // silver ou gold
              isPremium: true, // Mantém compatibilidade
              premiumSince: new Date().toISOString(),
              dailyCount: 0 // Reseta contador imediatamente
            }, { merge: true });
        }
      }
    } catch (error) {
      console.error("Erro Webhook:", error);
    }
  }

  return res.status(200).send("OK");
}