require("dotenv").config();

async function sendProductSMS({ to_number, products, message_text }) {
  const apiKey = process.env.PINGRAM_API_KEY;

  let phone = to_number;
  let prods = products;

  if (!phone || !prods || prods.length === 0) {
    return { success: false, spoken: "I need your phone number and products to send the photos." };
  }

  const digits = phone.replace(/[^0-9]/g, "");
  const toNumber = digits.startsWith("1") ? "+" + digits : "+1" + digits;

  if (!apiKey) {
    const spoken = prods.map((p, i) => `Option ${i+1}: ${p.title} for ${p.price}.`).join(" ");
    return { success: true, spoken: "Here are your options. " + spoken + " Which number would you like?" };
  }

  try {
    const { Pingram } = require("pingram");
    const pingram = new Pingram({ apiKey });

    console.log("[SMS] Sending to:", toNumber, "Products:", prods.length);

    // Message 1 — summary of all 3 options in one text
    const summary = [
      "🛍️ ShopAgent Results",
      "────────────────",
      ...prods.map((p, i) =>
        `${i+1}. ${p.title}\n   ${p.price} · ${p.rating}⭐${p.prime ? " · Free shipping" : ""}`
      ),
      "────────────────",
      "Photos below 👇",
      `📞 Say option 1, 2 or 3 to order`,
    ].join("\n");

    await pingram.sms.send({
      type: "shopagent_sms",
      to: toNumber,
      message: summary
    });

    // Messages 2, 3, 4 — one photo per product
    for (let i = 0; i < prods.length; i++) {
      const p = prods[i];
      const imageUrl = p.image_url || p.thumbnail || "";

      if (imageUrl && imageUrl.startsWith("https://")) {
        await pingram.sms.send({
          type: "shopagent_sms",
          to: toNumber,
          message: `Option ${i + 1}: ${p.title} — ${p.price}`,
          mediaUrls: [imageUrl]
        });
        console.log("[SMS] MMS option", i + 1);
      }
    }

    console.log("[SMS] Done —", toNumber);

    return {
      success: true,
      spoken: `I just texted you all 3 options with photos. Take a look and tell me which number you want.`,
    };

  } catch (err) {
    console.error("[SMS] Error:", err.message);
    const spoken = prods.map((p, i) => `Option ${i+1}: ${p.title} for ${p.price}.`).join(" ");
    return {
      success: false,
      spoken: "I had trouble sending the texts. Your options are: " + spoken + " Which number would you like?",
    };
  }
}

module.exports = { sendProductSMS };
