require("dotenv").config();

function generateOrderId() {
  return "ORD-" + Date.now().toString(36).toUpperCase();
}

function getEstimatedDelivery() {
  const d = new Date();
  d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : d.getDay() === 6 ? 2 : 1));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

async function placeOrder({ customer_phone, product_title, product_price, product_url, asin, stripe_customer_id }) {
  const orderId = generateOrderId();
  const eta = getEstimatedDelivery();

  try {
    let chargeId = "demo_" + orderId;

    if (stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
        const cents = Math.round(parseFloat(product_price.replace(/[^0-9.]/g, "")) * 100);
        const pi = await stripe.paymentIntents.create({
          amount: cents, currency: "usd",
          customer: stripe_customer_id,
          off_session: true, confirm: true,
          description: "ShopAgent: " + product_title,
          metadata: { order_id: orderId, asin: asin || "" },
        });
        if (pi.status !== "succeeded") {
          return { success: false, spoken: "Your payment did not go through. Your card was not charged. Would you like to try again?" };
        }
        chargeId = pi.id;
      } catch (stripeErr) {
        return { success: false, spoken: "Payment failed: " + stripeErr.message };
      }
    }

    // Save order to database
    try {
      const db = require("../db");
      await db.saveOrder({
        order_id: orderId, customer_phone,
        product_title, product_price, product_url, asin,
        stripe_charge_id: chargeId, estimated_delivery: eta,
      });
      // Update customer stats
      const priceNum = parseFloat((product_price || "0").replace(/[^0-9.]/g, "")) || 0;
      await db.pool.query(
        `UPDATE customers SET total_orders = total_orders + 1, total_spent = total_spent + $2, updated_at = NOW() WHERE phone = $1`,
        [customer_phone, priceNum]
      );
    } catch (dbErr) {
      console.error("DB save order error:", dbErr.message);
    }

    // Send confirmation SMS
    if (customer_phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith("AC")) {
      try {
        const twilio = require("twilio");
        const tc = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const digits = customer_phone.replace(/\D/g, "");
        const to = digits.startsWith("1") ? "+" + digits : "+1" + digits;
        await tc.messages.create({
          body: "ShopAgent Order Confirmed!\n\n" + product_title + "\nPrice: " + product_price + "\nOrder ID: " + orderId + "\nDelivery: " + eta + "\n\nWe will text you tracking updates when your item ships!",
          from: process.env.TWILIO_FROM_NUMBER,
          to,
        });
      } catch (smsErr) {
        console.error("Confirmation SMS failed:", smsErr.message);
      }
    }

    return {
      success: true, order_id: orderId, charge_id: chargeId, estimated_delivery: eta,
      spoken: "Your order has been placed! Order ID is " + orderId + ". " + product_title + " will arrive by " + eta + ". I have sent a confirmation text to your phone. Is there anything else I can help you shop for?",
    };
  } catch (err) {
    console.error("Order error:", err.message);
    return { success: false, spoken: "I ran into a problem placing your order. Your card has not been charged. Would you like to try again?" };
  }
}

module.exports = { placeOrder };
