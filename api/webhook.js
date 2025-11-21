import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore, doc, setDoc } from "firebase-admin/firestore";

if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({ credential: cert(serviceAccount) });
  } catch (err) {
    console.error("Erro ao inicializar Firebase:", err);
  }
}

const db = getFirestore();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { data, type } = req.body;

    if (type !== "payment" || !data?.id) {
      return res.status(200).send("Evento ignorado");
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${data.id}`,
      {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
      }
    );

    const mpData = await mpResponse.json();

    if (mpData.status !== "approved") {
      return res.status(200).send("Pagamento ainda não aprovado");
    }

    const userId = mpData.metadata?.user_id;
    const planType = mpData.metadata?.plan_type;

    if (!userId || !planType) {
      console.error("Metadata ausente no pagamento");
      return res.status(400).json({ error: "Metadata ausente" });
    }

    const userRef = doc(db, "artifacts", "default-app-id", "users", userId, "profile", "data");

    await setDoc(userRef, {
      subscription: planType,
      activatedAt: new Date().toISOString(),
      dailyCount: 0
    }, { merge: true });

    console.log(`🔥 Plano ${planType.toUpperCase()} ativado para usuário ${userId}`);
    return res.status(200).send("Plano ativado com sucesso");

  } catch (error) {
    console.error("❌ Erro Webhook:", error);
    return res.status(500).json({ error: "Erro interno no webhook" });
  }
}