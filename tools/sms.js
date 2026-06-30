require("dotenv").config();

async function sendProductSMS({ to_number, products, message_text }) {
  const apiKey    = process.env.TELNYX_API_KEY;
  const fromNumber = process.env.TELNYX_FROM_NUMBER;

  let phone = to_number;
  let prods = products;

  if (!phone || !prods || prods.length === 0) {
    return { success: false, spoken: "I need your phone number and products to send the photos." };
  }

  const digits   = phone.replace(/[^0-9]/g, "");
  const toNumber = digits.startsWith("1") ? "+" + digits : "+1" + digits;

  if (!apiKey || !fromNumber) {
    const spoken = prods.map((p, i) => `Option ${i+1}: ${p.title} for ${p.price}.`).join(" ");
    return { success: true, spoken: "Here are your options. " + spoken + " Which number would you like?" };
  }

  try {
    const fetch = require("node-fetch");

    const headers = {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    console.log("[SMS] Sending to:", toNumber, "Products:", prods.length);

    // Message 1 — text summary of all options
    const summary = [
      "🛙 ShopAgent Results",
      "────────────────",
      ...prods.map((p, i) =>
        `${i+1}. ${p.title}\n   ${p.price} · ${p.rating}⭐${p.prime ? " · Free shipping" : ""}`
      ),
      "────────────────",
      "Photos below 👇",
      "📞 Say option 1, 2 or 3 to order",
    ].join("\n");

    await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        from: fromNumber,
        to:   toNumber,
        text: summary,
      }),
    }).then(r => r.json());

    // Messages 2-4 — one MMS per product with photo
    for (let i = 0; i < prods.length; i++) {
      const p        = prods[i];
      const imageUrl = p.image_url || p.thumbnail || "";

      if (imageUrl && imageUrl.startsWith("https://")) {
        const body = {
          from:      fromNumber,
          to:        toNumber,
          text:      `Option ${i + 1}: ${p.title} — ${p.price}`,
          media_urls: [imageUrl],
        };

        const res  = await fetch("https://api.telnyx.com/v2/messages", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const data = await res.json();

        if (data.errors) {
          console.error("[SMS] Telnyx MMS error option", i + 1, JSON.stringify(data.errors));
        } else {
          console.log("[SMS] MMS option", i + 1, "status:", data.data?.to?.[0]?.status);
        }
      }
    }

    console.log("[SMS] Done —", toNumber);

    return {
      success: true,
      spoken: "I just texted you all 3 options with photos. Take a look and tell me which number you want.",
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
