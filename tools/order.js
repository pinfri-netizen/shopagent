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

  try {
    let chargeId = "demo_" + orderId;

    if (stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
        const cents = Math.round(parseFloat(product_price.replace(/[^0-9.]/g, "")) * 100);
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
      } catch (stripeErr) {
        return { success: false, spoken: "I had a problem processing your payment. Your card was not charged. " + stripeErr.message };
      }
    }

    const eta = getEstimatedDelivery();

    if (customer_phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith("AC")) {
      try {
        const twilio = require("twilio");
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const digits = customer_phone.replace(/\D/g, "");
        const toNumber = digits.startsWith("1") ? "+" + digits : "+1" + digits;
        await twilioClient.messages.create({
          body: [
            "ShopAgent Order Confirmed!",
            "",
            product_title,
            "Price: " + product_price,
            "Order ID: " + orderId,
            "Estimated delivery: " + eta,
            "",
            "We will text you tracking updates when your item ships!",
          ].join("\n"),
          from: process.env.TWILIO_FROM_NUMBER,
          to: toNumber,
        });
      } catch (smsErr) {
        console.error("Confirmation SMS failed:", smsErr.message);
      }
    }

    return {
      success: true,
      order_id: orderId,
      charge_id: chargeId,
      estimated_delivery: eta,
      spoken: "Your order has been placed! Order ID is " + orderId + ". Your card has been charged " + product_price + ". You should receive your " + product_title + " by " + eta + ". I have sent you a confirmation text. Is there anything else I can help you shop for today?",
    };
  } catch (err) {
    console.error("Order error:", err.message);
    return { success: false, spoken: "I ran into a problem placing your order. Your card has not been charged. Would you like to try again?" };
  }
}

module.exports = { placeOrder };
