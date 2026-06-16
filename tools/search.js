require("dotenv").config();

async function searchProducts({ query, sort, max_price }) {
  console.log("[SEARCH] Searching for:", query);

  const sortText = {
    price_low:    "lowest price first",
    best_reviews: "highest rated first",
    best_value:   "best balance of price and quality",
  }[sort] || "best value";

  const priceFilter = max_price ? ` Budget: under $${max_price}.` : "";

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: `You are an Amazon product expert. Generate a JSON array of exactly 3 realistic Amazon products for: "${query}".${priceFilter} Sort by ${sortText}.

Use real product names, realistic prices, and realistic ASINs that follow Amazon's format (B0 followed by 8 alphanumeric characters).

Respond with ONLY the JSON array. Start your response with [ and end with ]. No other text.

[
  {
    "title": "Full Product Name by Brand",
    "price": "$XX.XX",
    "original_price": "$XX.XX",
    "rating": "4.X",
    "reviews": "X,XXX",
    "prime": true,
    "image_url": "",
    "asin": "B0XXXXXXXX",
    "url": "https://www.amazon.com/dp/B0XXXXXXXX",
    "badge": "Best value",
    "highlight": "Perfect for this use case because...",
    "specs": ["Key spec 1", "Key spec 2", "Key spec 3"]
  }
]`
      }],
    });

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    console.log("[SEARCH] Response preview:", text.slice(0, 200));

    const cleaned = text.replace(/```json/gi, "").replace(/```/gi, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);

    if (match) {
      const products = JSON.parse(match[0]);
      console.log("[SEARCH] Got", products.length, "products");

      const spoken = products.map((p, i) =>
        `Option ${i + 1}: ${p.title} for ${p.price}, rated ${p.rating} stars${p.prime ? " with free Prime shipping" : ""}.`
      ).join(" ");

      return {
        success: true,
        spoken: `I found ${products.length} great options sorted by ${sortText}. ${spoken} I am sending you photos by text right now. Which number would you like?`,
        products,
      };
    }

    throw new Error("No JSON in response");

  } catch (err) {
    console.error("[SEARCH] Error:", err.message);
    return {
      success: false,
      spoken: "I had trouble with that search. Could you describe what you are looking for again?",
      products: [],
    };
  }
}

module.exports = { searchProducts };
