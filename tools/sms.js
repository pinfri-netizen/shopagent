require("dotenv").config();

// In-memory store — keeps last search results per call session
// Key: call timestamp (rounded to 30s), Value: {phone, products}
const sessionStore = {};

function storeSession(phone, products) {
  const key = Math.floor(Date.now() / 30000); // 30-second window
  sessionStore[key] = { phone, products };
  // Clean up old sessions
  const cutoff = Math.floor(Date.now() / 30000) - 10;
  Object.keys(sessionStore).forEach(k => { if (k < cutoff) delete sessionStore[k]; });
  console.log("[SMS] Stored session for phone:", phone, "products:", products.length);
}

function getSession() {
  const key = Math.floor(Date.now() / 30000);
  return sessionStore[key] || sessionStore[key - 1] || sessionStore[key - 2] || null;
}

// Called by search.js after successful search
function cacheSearchResults(phone, products) {
  storeSession(phone, products);
}

async function sendProductSMS({ to_number, products, message_text }) {
  const apiKey = process.env.PINGRAM_API_KEY;

  // Try to get phone and products from args, or fall back to session cache
  let phone = to_number;
  let prods = products;

  if (!phone || !prods || prods.length === 0) {
    const session = getSession();
    if (session) {
      phone = phone || session.phone;
      prods = (prods && prods.length > 0) ? prods : session.products;
      console.log("[SMS] Retrieved from session cache — phone:", phone, "products:", prods?.length);
    }
  }

  if (!phone) {
    console.error("[SMS] No phone number available");
    return { success: false, spoken: "I need your phone number to send the photos. Could you repeat it for me?" };
  }

  if (!prods || prods.length === 0) {
    console.error("[SMS] No products available");
    return { success: false, spoken: "I lost the search results. Let me search again for you." };
  }

  if (!apiKey) {
    console.warn("[SMS] PINGRAM_API_KEY not set");
    const spoken = prods.map((p, i) => {
      const title = p.title || p;
      const price = p.price || "";
      return `Option ${i+1}: ${title} for ${price}.`;
    }).join(" ");
    return { success: true, spoken: "Here are your options. " + spoken + " Which number would you like?" };
  }

  const digits = phone.replace(/\D/g, "");
  const toNumber = digits.startsWith("1") ? "+" + digits : "+1" + digits;

  try {
    const { Pingram } = require("pingram");
    const pingram = new Pingram({ apiKey });

    console.log("[SMS] Sending to:", toNumber, "Products:", prods.length);

    // Send intro
    await pingram.send({
      type: "shopagent_sms",
      to: { number: toNumber },
      sms: { message: message_text || "Here are your ShopAgent results! Reply with the option number to order:" }
    });

    // Send each product
    for (let i = 0; i < prods.length; i++) {
      const p = prods[i];

      // Handle both full objects and string summaries
      const title = p.title || String(p);
      const price = p.price || "";
      const rating = p.rating || "";
      const reviews = p.reviews || "";
      const prime = p.prime || false;
      const imageUrl = p.image_url || p.thumbnail || "";

      const msg = [
        `Option ${i + 1}: ${title}`,
        price ? `Price: ${price}` : "",
        rating ? `${rating} stars${reviews ? " · " + reviews + " reviews" : ""}` : "",
        prime ? "✅ FREE Prime shipping" : "",
      ].filter(Boolean).join("\n");

      const smsPayload = { message: msg };

      if (imageUrl && imageUrl.startsWith("https://")) {
        smsPayload.mediaUrls = [imageUrl];
        console.log("[SMS] Sending MMS with image for option", i + 1, imageUrl.slice(0, 60));
      } else {
        console.log("[SMS] No image for option", i + 1);
      }

      await pingram.send({
        type: "shopagent_sms",
        to: { number: toNumber },
        sms: smsPayload
      });
    }

    // Closing message
    await pingram.send({
      type: "shopagent_sms",
      to: { number: toNumber },
      sms: { message: "Still on the call? Say option 1, 2, or 3 and I will place your order!" }
    });

    console.log("[SMS] Successfully sent", prods.length, "messages to", toNumber);

    return {
      success: true,
      spoken: `I just sent you ${prods.length} product options by text. Take a look and tell me which number you want.`,
    };

  } catch (err) {
    console.error("[SMS] Error:", err.message);
    const spoken = prods.map((p, i) => `Option ${i+1}: ${p.title || p} for ${p.price || ""}.`).join(" ");
    return {
      success: false,
      spoken: "I had trouble sending the texts. Here are your options verbally: " + spoken + " Which number would you like?",
    };
  }
}

module.exports = { sendProductSMS, cacheSearchResults };
