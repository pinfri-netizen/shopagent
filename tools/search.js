require("dotenv").config();

async function searchProducts({ query, sort, max_price }) {
  const sortText = {
    price_low:    "Sort results by price lowest to highest.",
    best_reviews: "Sort results by highest customer ratings first.",
    best_value:   "Prioritize the best balance of price and rating.",
  }[sort] || "Sort by best value.";

  const priceText = max_price ? "Only include products under $" + max_price + "." : "";

  const prompt = `Search Amazon for: "${query}"
${priceText}
${sortText}
Return exactly 3 real Amazon products as a JSON array. Each item must have:
- title: full product name
- price: current price as string e.g. "$49.99"
- original_price: original price if on sale
- rating: star rating e.g. "4.7"
- reviews: review count e.g. "8,420"
- prime: true or false
- image_url: Amazon image URL starting with https://m.media-amazon.com/
- asin: Amazon product ID
- url: https://www.amazon.com/dp/[ASIN]
- badge: one of "Best value" | "Top rated" | "Lowest price" | "Best seller"
- highlight: one sentence why this matches the search
- specs: array of 3 key specs
Return ONLY a valid JSON array. No markdown, no explanation, no code blocks.`;

  console.log("[SEARCH] Starting search for:", query);
  console.log("[SEARCH] ANTHROPIC_API_KEY present:", !!process.env.ANTHROPIC_API_KEY);
  console.log("[SEARCH] Key prefix:", process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.slice(0, 15) + "..." : "MISSING");

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    console.log("[SEARCH] Calling Anthropic API...");

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });

    console.log("[SEARCH] API response received, stop_reason:", response.stop_reason);

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    console.log("[SEARCH] Text response length:", text.length);
    console.log("[SEARCH] Text preview:", text.slice(0, 200));

    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      console.error("[SEARCH] No JSON array found in response");
      return {
        success: false,
        spoken: "I found some results but had trouble formatting them. Let me try again.",
        products: [],
      };
    }

    const products = JSON.parse(match[0]);
    console.log("[SEARCH] Found", products.length, "products");

    const spokenSummary = products.map((p, i) =>
      "Option " + (i + 1) + ": " + p.title + " for " + p.price + ", rated " + p.rating + " stars."
    ).join(" ");

    return {
      success: true,
      spoken: "I found " + products.length + " great options. " + spokenSummary + " I am sending you photos of all three by text message right now. Which one would you like?",
      products,
    };
  } catch (err) {
    console.error("[SEARCH] Error type:", err.constructor.name);
    console.error("[SEARCH] Error message:", err.message);
    console.error("[SEARCH] Error status:", err.status);
    console.error("[SEARCH] Full error:", JSON.stringify(err, Object.getOwnPropertyNames(err)).slice(0, 500));
    return {
      success: false,
      spoken: "I had trouble searching right now. Could you repeat what you are looking for?",
      products: [],
    };
  }
}

module.exports = { searchProducts };
