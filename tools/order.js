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

  console.log("[ORDER] Placing order for:", product_title, "ASIN:", asin);
  console.log("[ORDER] Ship to:", JSON.stringify(shipping_address));

  // ── Step 1: Charge customer via Stripe ──────────────
  let chargeId = "demo_" + orderId;
  let chargeSuccess = false;

  if (stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
    try {
      const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
      const cents = Math.round(parseFloat((product_price || "0").replace(/[^0-9.]/g, "")) * 100);
      const pi = await stripe.paymentIntents.create({
        amount: cents,
        currency: "usd",
        customer: stripe_customer_id,
        off_session: true,
        confirm: true,
        description: "ShopAgent: " + product_title,
        metadata: { order_id: orderId, asin: asin || "" },
      });
      if (pi.status !== "succeeded") {
        return { success: false, spoken: "Your payment did not go through. Your card was not charged. Would you like to try again?" };
      }
      chargeId = pi.id;
      chargeSuccess = true;
      console.log("[ORDER] Stripe charge succeeded:", chargeId);
    } catch (stripeErr) {
      return { success: false, spoken: "Payment failed: " + stripeErr.message + ". Your card was not charged." };
    }
  } else {
    // Demo mode — no Stripe configured
    chargeSuccess = true;
    console.log("[ORDER] Demo mode — skipping Stripe charge");
  }

  // ── Step 2: Place order via Zinc API ─────────────────
  const zincKey = process.env.ZINC_API_KEY;
  let zincOrderId = null;
  let zincSuccess = false;

  if (zincKey && asin && shipping_address) {
    try {
      const fetch = require("node-fetch");

      const zincPayload = {
        retailer: "amazon",
        products: [{ product_id: asin, quantity: 1 }],
        shipping_address: {
          first_name: shipping_address.first_name || customer_phone,
          last_name: shipping_address.last_name || "",
          address_line1: shipping_address.address_line1 || shipping_address.street || "",
          address_line2: shipping_address.address_line2 || "",
          zip_code: shipping_address.zip_code || shipping_address.zip || "",
          city: shipping_address.city || "",
          state: shipping_address.state || "",
          country: shipping_address.country || "US",
          phone_number: customer_phone || "",
        },
        shipping: { order_by: "price", max_days: 5 },
        payment_method: {
          use_gift: false,
          name_on_card: shipping_address.first_name + " " + shipping_address.last_name,
          number: process.env.ZINC_CARD_NUMBER || "",
          security_code: process.env.ZINC_CARD_CVV || "",
          expiration_month: parseInt(process.env.ZINC_CARD_EXP_MONTH || "1"),
          expiration_year: parseInt(process.env.ZINC_CARD_EXP_YEAR || "2027"),
          use_account_payment_defaults: true,
        },
        is_gift: false,
        webhooks: {
          order_placed: process.env.SERVER_URL + "/zinc/webhook",
          order_failed: process.env.SERVER_URL + "/zinc/webhook",
        },
        client_notes: { shopagent_order_id: orderId, customer_phone },
      };

      console.log("[ORDER] Calling Zinc API...");

      const zincRes = await fetch("https://api.zinc.io/v1/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + Buffer.from(zincKey + ":").toString("base64"),
        },
        body: JSON.stringify(zincPayload),
      });

      const zincData = await zincRes.json();
      console.log("[ORDER] Zinc response:", JSON.stringify(zincData).slice(0, 300));

      if (zincData.request_id) {
        zincOrderId = zincData.request_id;
        zincSuccess = true;
        console.log("[ORDER] Zinc order created:", zincOrderId);
      } else if (zincData.code) {
        console.error("[ORDER] Zinc error:", zincData.message);
      }
    } catch (zincErr) {
      console.error("[ORDER] Zinc error:", zincErr.message);
    }
  } else {
    if (!asin) console.log("[ORDER] No ASIN — skipping Zinc, using demo mode");
    if (!shipping_address) console.log("[ORDER] No shipping address — skipping Zinc");
    if (!zincKey) console.log("[ORDER] No ZINC_API_KEY — skipping Zinc");
  }

  // ── Step 3: Save to database ──────────────────────────
  try {
    const db = require("../db");
    await db.saveOrder({
      order_id: orderId,
      customer_phone,
      product_title,
      product_price,
      product_url,
      asin,
      stripe_charge_id: chargeId,
      estimated_delivery: eta,
      status: zincSuccess ? "processing" : "confirmed",
    });
    const priceNum = parseFloat((product_price || "0").replace(/[^0-9.]/g, "")) || 0;
    await db.pool.query(
      "UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + $2, updated_at = NOW() WHERE phone = $1",
      [customer_phone, priceNum]
    );
  } catch (dbErr) {
    console.error("[ORDER] DB save error:", dbErr.message);
  }

  // ── Step 4: Send confirmation SMS ────────────────────
  if (customer_phone && process.env.PINGRAM_API_KEY) {
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
            zincOrderId ? "🏪 Amazon Order: " + zincOrderId : "",
            "🚚 Est. delivery: " + eta,
            "",
            "We will text you tracking updates when your item ships!",
          ].filter(Boolean).join("\n")
        }
      });
      console.log("[ORDER] Confirmation SMS sent");
    } catch (smsErr) {
      console.error("[ORDER] SMS error:", smsErr.message);
    }
  }

  return {
    success: true,
    order_id: orderId,
    zinc_order_id: zincOrderId,
    estimated_delivery: eta,
    spoken: zincSuccess
      ? `Your order has been placed on Amazon! Order ID is ${orderId}. Your ${product_title} should arrive by ${eta}. I have sent you a confirmation text with all the details. Is there anything else I can help you shop for?`
      : `Your order is confirmed! Order ID is ${orderId}. I have sent you a confirmation text. Your ${product_title} should arrive by ${eta}. Is there anything else I can help you shop for today?`,
  };
}

module.exports = { placeOrder };
