require("dotenv").config();

const PACKAGES = {
  "1": { minutes: 15,  price: 999,  label: "15 minutes for $9.99" },
  "2": { minutes: 30,  price: 1799, label: "30 minutes for $17.99" },
  "3": { minutes: 60,  price: 2999, label: "60 minutes for $29.99" },
  "4": { minutes: 120, price: 4999, label: "120 minutes for $49.99" },
};

async function topupByPhone({ phone_number, package_choice, card_number, card_expiry, card_cvv, card_name }) {
  console.log("[TOPUP] Phone top-up for:", phone_number, "package:", package_choice);

  const pkg = PACKAGES[String(package_choice)];
  if (!pkg) {
    return {
      success: false,
      spoken: "I didn't catch that package choice. Your options are: Option 1 — 15 minutes for $9.99. Option 2 — 30 minutes for $17.99. Option 3 — 60 minutes for $29.99. Option 4 — 120 minutes for $49.99. Which would you like?"
    };
  }

  if (!card_number || !card_expiry || !card_cvv) {
    return {
      success: false,
      spoken: "I need your card details to process the payment. Could you give me your card number?"
    };
  }

  // Clean card details
  const cleanCard = card_number.replace(/\D/g, "");
  const cleanCvv = card_cvv.replace(/\D/g, "");

  // Parse expiry — accept formats like "0526", "05/26", "05 26"
  const expiryDigits = card_expiry.replace(/\D/g, "");
  let expMonth, expYear;
  if (expiryDigits.length === 4) {
    expMonth = parseInt(expiryDigits.slice(0, 2));
    expYear = parseInt("20" + expiryDigits.slice(2));
  } else if (expiryDigits.length === 6) {
    expMonth = parseInt(expiryDigits.slice(0, 2));
    expYear = parseInt(expiryDigits.slice(2));
  } else {
    return {
      success: false,
      spoken: "I didn't catch the expiry date. Could you repeat it? For example, say 0 5 2 6 for May 2026."
    };
  }

  const digits = (phone_number || "").replace(/\D/g, "");
  const normalized = digits.startsWith("1") ? "+" + digits : "+1" + digits;

  try {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const db = require("../db");

    // Get or create Stripe customer
    const customer = await db.getOrCreateCustomer(normalized);
    let stripeCustomerId = customer.stripe_customer_id;

    if (!stripeCustomerId) {
      const sc = await stripe.customers.create({
        phone: normalized,
        name: card_name || "",
        metadata: { shopagent_phone: normalized }
      });
      stripeCustomerId = sc.id;
      await db.updateCustomer(normalized, { stripe_customer_id: stripeCustomerId });
    }

    // Create payment method from card details
    const paymentMethod = await stripe.paymentMethods.create({
      type: "card",
      card: {
        number: cleanCard,
        exp_month: expMonth,
        exp_year: expYear,
        cvc: cleanCvv,
      },
      billing_details: { name: card_name || "ShopAgent Customer" }
    });

    // Attach to customer
    await stripe.paymentMethods.attach(paymentMethod.id, { customer: stripeCustomerId });

    // Charge the card
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pkg.price,
      currency: "usd",
      customer: stripeCustomerId,
      payment_method: paymentMethod.id,
      off_session: true,
      confirm: true,
      description: "ShopAgent: " + pkg.label,
      metadata: { phone: normalized, minutes: String(pkg.minutes) }
    });

    if (paymentIntent.status !== "succeeded") {
      return {
        success: false,
        spoken: "Your card was declined. Please check your card details and try again, or use a different card."
      };
    }

    // Add minutes to account
    const newBalance = await db.savePurchase(normalized, pkg.minutes, pkg.price / 100, paymentIntent.id);

    console.log("[TOPUP] Success! Added", pkg.minutes, "mins to", normalized, "new balance:", newBalance);

    // Send confirmation SMS
    if (process.env.PINGRAM_API_KEY) {
      try {
        const { Pingram } = require("pingram");
        const pingram = new Pingram({ apiKey: process.env.PINGRAM_API_KEY });
        await pingram.send({
          type: "shopagent_sms",
          to: { number: normalized },
          sms: {
            message: [
              "✅ ShopAgent Top-Up Confirmed!",
              "",
              `Added: ${pkg.minutes} minutes`,
              `Charged: $${(pkg.price / 100).toFixed(2)}`,
              `New balance: ${newBalance} minutes`,
              "",
              "Happy shopping! 🛍️"
            ].join("\n")
          }
        });
      } catch(smsErr) {
        console.error("[TOPUP] SMS error:", smsErr.message);
      }
    }

    return {
      success: true,
      minutes_added: pkg.minutes,
      new_balance: newBalance,
      spoken: `Payment successful! I have added ${pkg.minutes} minutes to your account. Your new balance is ${newBalance} minutes. I have also sent you a confirmation text. Now, what would you like to shop for today?`
    };

  } catch (err) {
    console.error("[TOPUP] Error:", err.message);

    if (err.type === "StripeCardError") {
      return {
        success: false,
        spoken: "Your card was declined — " + (err.message || "please try a different card") + ". Would you like to try another card?"
      };
    }

    return {
      success: false,
      spoken: "I had trouble processing your payment. Your card was not charged. Would you like to try again?"
    };
  }
}

module.exports = { topupByPhone, PACKAGES };
