require("dotenv").config();

async function sendProductSMS({ to_number, products, message_text }) {
  if (!to_number) {
    return { success: false, spoken: "I do not have your phone number to send pictures to." };
  }

  const apiKey = process.env.PINGRAM_API_KEY;
  if (!apiKey) {
    console.warn("[SMS] PINGRAM_API_KEY not set — skipping SMS");
    return {
      success: true,
      spoken: (products || []).map((p, i) =>
        "Option " + (i+1) + ": " + p.title + " for " + p.price + "."
      ).join(" ") + " Which number would you like?",
    };
  }

  const digits = to_number.replace(/\D/g, "");
  const toNumber = digits.startsWith("1") ? "+" + digits : "+1" + digits;

  try {
    const { Pingram } = require("pingram");
    const pingram = new Pingram({ apiKey });

    console.log("[SMS] Sending to:", toNumber);

    // Send intro message
    await pingram.send({
      type: "shopagent_sms",
      to: { number: toNumber },
      sms: { message: message_text || "Here are your ShopAgent results! Tell me the option number to order:" }
    });

    // Send each product
    for (let i = 0; i < (products || []).length; i++) {
      const p = products[i];
      const msg = [
        `Option ${i + 1}: ${p.title}`,
        `Price: ${p.price}${p.original_price && p.original_price !== p.price ? ` (was ${p.original_price})` : ""}`,
        `${p.rating} stars · ${p.reviews} reviews`,
        p.prime ? "FREE Prime shipping" : "",
        p.url ? `Link: ${p.url}` : "",
      ].filter(Boolean).join("\n");

      await pingram.send({
        type: "shopagent_sms",
        to: { number: toNumber },
        sms: { message: msg }
      });
    }

    // Send closing message
    await pingram.send({
      type: "shopagent_sms",
      to: { number: toNumber },
      sms: { message: "Still on the call? Say option 1, 2, or 3 and I will place your order right away!" }
    });

    console.log("[SMS] Successfully sent", (products || []).length, "messages to", toNumber);

    return {
      success: true,
      spoken: "I just sent you " + (products ? products.length : 0) + " product options by text. Take a look and tell me which number you want.",
    };

  } catch (err) {
    console.error("[SMS] Error:", err.message);
    return {
      success: false,
      spoken: "I had trouble sending the texts but you can still pick by number. " +
        (products || []).map((p, i) => "Option " + (i+1) + ": " + p.title + " for " + p.price + ".").join(" "),
      error: err.message,
    };
  }
}

module.exports = { sendProductSMS };
