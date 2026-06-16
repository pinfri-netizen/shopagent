require("dotenv").config();

async function searchProducts({ query, sort, max_price }) {
  console.log("[SEARCH] Searching for:", query);

  const sortText = {
    price_low:    "lowest price",
    best_reviews: "best reviewed",
    best_value:   "best value",
  }[sort] || "best value";

  const priceFilter = max_price ? ` under $${max_price}` : "";

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ONE call only — search + format in a single request
    // Use tool_choice to force exactly one web search then stop
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      tool_choice: { type: "auto" },
      system: `You are a product search assistant. When given a search query, search Amazon once and return ONLY a JSON array of 3 products. No explanation, no markdown, just the raw JSON array starting with [ and ending with ].

Each product must have: title, price (e.g. "$29.99"), rating (e.g. "4.5"), reviews (e.g. "1,234"), prime (true/false), image_url (from m.media-amazon.com or empty string), asin, url (https://www.amazon.com/dp/ASIN), badge ("Best value"/"Top rated"/"Lowest price"), highlight (one sentence), specs (array of 3 strings).

After searching ONCE, immediately return the JSON array. Do not search multiple times.`,
      messages: [{
        role: "user",
        content: `Find 3 Amazon products for: ${query}${priceFilter}, sorted by ${sortText}. Return only the JSON array.`
      }],
    });

    console.log("[SEARCH] Stop reason:", response.stop_reason);
    console.log("[SEARCH] Content blocks:", response.content.length);

    // Get the text response
    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    console.log("[SEARCH] Response preview:", text.slice(0, 300));

    // Clean and parse JSON
    const cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
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

    throw new Error("No JSON array in response");

  } catch (err) {
    console.error("[SEARCH] Error:", err.message);
    return {
      success: false,
      spoken: "I had trouble searching. Could you describe what you are looking for again?",
      products: [],
    };
  }
}

module.exports = { searchProducts };
