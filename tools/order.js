require("dotenv").config();

function generateOrderId() {
  return "ORD-" + Date.now().toString(36).toUpperCase();
}

function getEstimatedDelivery() {
  const d = new Date();
  d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : d.getDay() === 6 ? 2 : 1));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

async function placeOrder({ customer_phone, product_title, product_price, product_url, asin, shipping_address, stripe_customer_id }) {
  const orderId = generateOrderId();
  const eta = getEstimatedDelivery();

  console.log("[ORDER] Placing order:", product_title, "ASIN:", asin);

  // ── Charge card via Stripe ────────────────────────────
  let chargeId = "demo_" + orderId;

  if (stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const cents = Math.round(parseFloat((product_price || "0").replace(/[^0-9.]/g, "")) * 100);
      const pi = await stripe.paymentIntents.create({
        amount: cents, currency: "usd", customer: stripe_customer_id,
        off_session: true, confirm: true,
        description: "ShopAgent: " + product_title,
        metadata: { order_id: orderId, asin: asin || "" },
      });
      if (pi.status !== "succeeded") {
        return { success: false, spoken: "Your payment did not go through. Your card was not charged. Would you like to try again?" };
      }
      chargeId = pi.id;
    } catch (err) {
      return { success: false, spoken: "Payment failed: " + err.message };
    }
  }

  // ── Save to database immediately ──────────────────────
  try {
    const db = require("../db");
    await db.saveOrder({
      order_id: orderId, customer_phone, product_title,
      product_price, product_url, asin,
      stripe_charge_id: chargeId, estimated_delivery: eta,
      status: "processing",
    });
    const priceNum = parseFloat((product_price || "0").replace(/[^0-9.]/g, "")) || 0;
    await db.pool.query(
      "UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + $2, updated_at = NOW() WHERE phone = $1",
      [customer_phone, priceNum]
    );
  } catch (dbErr) {
    console.error("[ORDER] DB error:", dbErr.message);
  }

  // ── Place on Amazon via Zinc in background ────────────
  const zincKey = process.env.ZINC_API_KEY;
  if (zincKey && asin && shipping_address) {
    setTimeout(async () => {
      try {
        const fetch = require("node-fetch");
        const addr = shipping_address;
        const zincPayload = {
          retailer: "amazon",
          products: [{ product_id: asin, quantity: 1 }],
          shipping_address: {
            first_name: addr.first_name || "Customer",
            last_name: addr.last_name || "",
            address_line1: addr.address_line1 || addr.street || "",
            address_line2: addr.address_line2 || "",
            zip_code: addr.zip_code || addr.zip || "",
            city: addr.city || "",
            state: addr.state || "",
            country: "US",
            phone_number: customer_phone || "",
          },
          shipping: { order_by: "price", max_days: 5 },
          is_gift: false,
          client_notes: { shopagent_order_id: orderId, customer_phone },
        };

        const zincRes = await fetch("https://api.zinc.io/v1/orders", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Basic " + Buffer.from(zincKey + ":").toString("base64"),
          },
          body: JSON.stringify(zincPayload),
        });
        const zincData = await zincRes.json();
        console.log("[ORDER] Zinc response:", JSON.stringify(zincData).slice(0, 200));
      } catch (err) {
        console.error("[ORDER] Zinc background error:", err.message);
      }
    }, 100);
  }

  // ── Send confirmation SMS ─────────────────────────────
  if (customer_phone && process.env.PINGRAM_API_KEY) {
    setTimeout(async () => {
      try {
        const { Pingram } = require("pingram");
        const pingram = new Pingram({ apiKey: process.env.PINGRAM_API_KEY });
        const digits = customer_phone.replace(/[^0-9]/g, "");
        const toNumber = digits.startsWith("1") ? "+" + digits : "+1" + digits;
        await pingram.send({
          type: "shopagent_sms",
          to: { number: toNumber },
          sms: {
            message: [
              "✅ ShopAgent Order Confirmed!",
              "",
              "📦 " + product_title,
              "💰 " + product_price,
              "🔖 Order ID: " + orderId,
              "🚚 Est. delivery: " + eta,
              "",
              "We will text you tracking updates when your item ships!",
            ].join("\n")
          }
        });
        console.log("[ORDER] Confirmation SMS sent");
      } catch (err) {
        console.error("[ORDER] SMS error:", err.message);
      }
    }, 200);
  }

  // ── Return immediately so call doesn't hang ───────────
  return {
    success: true,
    order_id: orderId,
    estimated_delivery: eta,
    spoken: "Your order is confirmed! Order ID is " + orderId + ". Your " + product_title + " should arrive by " + eta + ". I have sent you a confirmation text. Is there anything else I can help you shop for today?",
  };
}

module.exports = { placeOrder };
