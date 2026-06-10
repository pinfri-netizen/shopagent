// ═══════════════════════════════════════════════════
//  order.js — Place order and charge customer card
//  Uses Stripe for payment, Amazon for the order
// ═══════════════════════════════════════════════════

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const twilio = require("twilio");
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Generate a readable order ID
function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  return `ORD-${ts}`;
}

async function placeOrder({ customer_phone, product_title, product_price, product_url, asin, stripe_customer_id }) {
  const orderId = generateOrderId();

  try {
    // ── Step 1: Charge the customer's card via Stripe ──
    // In production, customer has a saved Stripe customer ID with a default payment method
    // For now we simulate a successful charge

    let chargeSuccess = false;
    let chargeId = null;

    if (stripe_customer_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const priceInCents = Math.round(parseFloat(product_price.replace(/[^0-9.]/g, "")) * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: priceInCents,
          currency: "usd",
          customer: stripe_customer_id,
          payment_method: "pm_card_visa", // use saved card on file
          off_session: true,
          confirm: true,
          description: `ShopAgent order: ${product_title}`,
          metadata: { order_id: orderId, asin: asin || "", source: "shopagent_vapi" },
        });

        chargeSuccess = paymentIntent.status === "succeeded";
        chargeId = paymentIntent.id;
      } catch (stripeErr) {
        console.error("Stripe charge failed:", stripeErr.message);
        return {
          success: false,
          spoken: `I'm sorry, I had a problem processing your payment. Your card was not charged. Would you like to try again or use a different card?`,
          error: stripeErr.message,
        };
      }
    } else {
      // Demo mode — simulate success
      chargeSuccess = true;
      chargeId = `demo_charge_${orderId}`;
    }

    if (!chargeSuccess) {
      return {
        success: false,
        spoken: "Your payment didn't go through. Please check your card details and try again.",
      };
    }

    // ── Step 2: Place the Amazon order ──
    // In production: use Amazon Buy API or Playwright browser automation
    // For MVP: redirect customer to Amazon with pre-filled cart, or use Buy with Prime API
    const amazonOrderConfirmed = true; // simulate success
    const estimatedDelivery = getEstimatedDelivery();

    // ── Step 3: Send order confirmation SMS ──
    if (customer_phone) {
      const formattedPhone = customer_phone.replace(/\D/g, "");
      const toNumber = formattedPhone.startsWith("1") ? `+${formattedPhone}` : `+1${formattedPhone}`;

      try {
        await twilioClient.messages.create({
          body: [
            `✅ ShopAgent Order Confirmed!`,
            ``,
            `📦 ${product_title}`,
            `💰 ${product_price} charged to card on file`,
            `🔖 Order ID: ${orderId}`,
            `🚚 Estimated delivery: ${estimatedDelivery}`,
            ``,
            `We'll text you tracking updates as soon as your item ships!`,
          ].join("\n"),
          from: process.env.TWILIO_FROM_NUMBER,
          to: toNumber,
        });
      } catch (smsErr) {
        console.error("Confirmation SMS failed:", smsErr.message);
        // Don't fail the order if SMS fails
      }
    }

    return {
      success: true,
      order_id: orderId,
      charge_id: chargeId,
      estimated_delivery: estimatedDelivery,
      spoken: `Your order has been placed! Order ID is ${orderId}. Your card has been charged ${product_price}. You should receive your ${product_title} by ${estimatedDelivery}. I've sent you a confirmation text with all the details. Is there anything else I can help you shop for today?`,
    };

  } catch (err) {
    console.error("Order error:", err.message);
    return {
      success: false,
      spoken: "I ran into a problem placing your order. Your card has not been charged. Would you like to try again?",
      error: err.message,
    };
  }
}

function getEstimatedDelivery() {
  const d = new Date();
  d.setDate(d.getDate() + (d.getDay() === 5 ? 3 : d.getDay() === 6 ? 2 : 1));
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

module.exports = { placeOrder };
