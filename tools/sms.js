require("dotenv").config();

async function sendProductSMS({ to_number, products, message_text }) {
  if (!to_number) {
    return { success: false, spoken: "I do not have your phone number to send pictures to." };
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const FROM = process.env.TWILIO_FROM_NUMBER;

  if (!sid || !sid.startsWith("AC") || !token || !FROM) {
    console.warn("Twilio not configured — skipping SMS");
    return {
      success: true,
      spoken: "I found your products. I am describing them now since text messaging is not yet configured. " +
        (products || []).map((p, i) => "Option " + (i+1) + ": " + p.title + " for " + p.price + ".").join(" ") +
        " Which number would you like?",
    };
  }

  const twilio = require("twilio");
  const client = twilio(sid, token);

  const digits = to_number.replace(/\D/g, "");
  const toNumber = digits.startsWith("1") ? "+" + digits : "+1" + digits;

  try {
    await client.messages.create({
      body: message_text || "Here are your ShopAgent results! Pick the one you want:",
      from: FROM,
      to: toNumber,
    });

    for (let i = 0; i < (products || []).length; i++) {
      const p = products[i];
      const body = [
        "Option " + (i + 1) + ": " + p.title,
        p.price + (p.original_price && p.original_price !== p.price ? " (was " + p.original_price + ")" : ""),
        p.rating + " stars - " + p.reviews + " reviews",
        p.prime ? "FREE Prime shipping" : "",
        p.url || "",
        "Reply with " + (i + 1) + " to order",
      ].filter(Boolean).join("\n");

      const opts = { body, from: FROM, to: toNumber };
      if (p.image_url && p.image_url.startsWith("https://")) {
        opts.mediaUrl = [p.image_url];
      }
      await client.messages.create(opts);
    }

    await client.messages.create({
      body: "Still on the call? Just say the option number (1, 2, or 3) and I will place your order!",
      from: FROM,
      to: toNumber,
    });

    return {
      success: true,
      spoken: "I just sent you " + (products ? products.length : 0) + " product photos by text message. Take a look and tell me which number you want.",
    };
  } catch (err) {
    console.error("SMS error:", err.message);
    return {
      success: false,
      spoken: "I had trouble sending the text messages but you can still pick an option by number.",
      error: err.message,
    };
  }
}

module.exports = { sendProductSMS };
