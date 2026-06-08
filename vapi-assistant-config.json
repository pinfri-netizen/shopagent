// ═══════════════════════════════════════════════════
//  sms.js — Send product images via Twilio MMS
//  Sends picture messages to the caller's phone
// ═══════════════════════════════════════════════════

const twilio = require("twilio");

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER; // must be MMS-capable

async function sendProductSMS({ to_number, products, message_text }) {
  if (!to_number) {
    return { success: false, spoken: "I don't have your phone number to send pictures to." };
  }

  // Clean the number
  const toNumber = to_number.replace(/\D/g, "");
  const formattedTo = toNumber.startsWith("1") ? `+${toNumber}` : `+1${toNumber}`;

  try {
    const sentMessages = [];

    // Send intro text first
    await client.messages.create({
      body: message_text || `Here are your ShopAgent results! Tap a product to see details on Amazon:`,
      from: FROM_NUMBER,
      to: formattedTo,
    });

    // Send each product as its own MMS with image
    for (let i = 0; i < (products || []).length; i++) {
      const p = products[i];
      const body = [
        `Option ${i + 1}: ${p.title}`,
        `💰 ${p.price}${p.original_price && p.original_price !== p.price ? ` (was ${p.original_price})` : ""}`,
        `⭐ ${p.rating} stars · ${p.reviews} reviews`,
        p.prime ? "✅ Prime — free fast shipping" : "",
        `🔗 ${p.url}`,
        `\nReply "${i + 1}" to order this one`,
      ].filter(Boolean).join("\n");

      const msgOptions = {
        body,
        from: FROM_NUMBER,
        to: formattedTo,
      };

      // Attach image if we have a valid Amazon image URL
      if (p.image_url && p.image_url.startsWith("https://")) {
        msgOptions.mediaUrl = [p.image_url];
      }

      const sent = await client.messages.create(msgOptions);
      sentMessages.push(sent.sid);
    }

    // Send confirmation footer
    await client.messages.create({
      body: `📞 Still on the call? Just tell me the option number (1, 2, or 3) and I'll place your order right away!`,
      from: FROM_NUMBER,
      to: formattedTo,
    });

    return {
      success: true,
      spoken: `I just sent you ${products?.length || 0} product photos by text message to your phone. Take a look and let me know which option you'd like — just say the number.`,
      message_sids: sentMessages,
    };
  } catch (err) {
    console.error("SMS error:", err.message);
    return {
      success: false,
      spoken: "I had trouble sending the text messages. You can still pick an option — I'll describe them again if you'd like.",
      error: err.message,
    };
  }
}

module.exports = { sendProductSMS };
