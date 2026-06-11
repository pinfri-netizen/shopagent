require("dotenv").config();
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
- original_price: original price if on sale, else same as price
- rating: star rating e.g. "4.7"
- reviews: review count e.g. "8,420"
- prime: true or false
- image_url: direct Amazon image URL starting with https://m.media-amazon.com/
- asin: Amazon product ID
- url: https://www.amazon.com/dp/[ASIN]
- badge: one of "Best value" | "Top rated" | "Lowest price" | "Best seller"
- highlight: one sentence why this matches the search
- specs: array of 3 key specs
Return ONLY valid JSON array, no markdown, no explanation.`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON in response");
    const products = JSON.parse(match[0]);

    const spokenSummary = products.map((p, i) =>
      "Option " + (i+1) + ": " + p.title + " for " + p.price + ", rated " + p.rating + " stars."
    ).join(" ");

    return {
      success: true,
      spoken: "I found " + products.length + " great options. " + spokenSummary + " I am sending you photos of all three by text message right now. Which one would you like?",
      products,
    };
  } catch (err) {
    console.error("Search error:", err.message);
    return {
      success: false,
      spoken: "I had trouble searching right now. Could you repeat what you are looking for?",
      products: [],
    };
  }
}

module.exports = { searchProducts };
