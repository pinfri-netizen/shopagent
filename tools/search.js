require("dotenv").config();

async function searchProducts({ query, sort, max_price }) {
  console.log("[SEARCH] Searching for:", query, "sort:", sort);

  const sortText = {
    price_low:    "lowest price",
    best_reviews: "best reviewed",
    best_value:   "best value",
  }[sort] || "best value";

  const priceFilter = max_price ? ` under $${max_price}` : "";

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Step 1: Search Amazon
    const searchResponse = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: `Search Amazon for: ${query}${priceFilter}. Find real products with prices, ratings, and ASINs.`
      }],
    });

    const searchText = searchResponse.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    console.log("[SEARCH] Raw search text length:", searchText.length);

    // Step 2: Format into clean JSON
    const formatResponse = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [{
        role: "user",
        content: `Based on this Amazon search data, extract or create 3 realistic products for "${query}"${priceFilter} sorted by ${sortText}.

Search data:
${searchText}

Return ONLY a valid JSON array (no markdown, no code blocks, just the raw JSON starting with [):
[
  {
    "title": "exact product name",
    "price": "$XX.XX",
    "original_price": "$XX.XX",
    "rating": "4.X",
    "reviews": "X,XXX",
    "prime": true,
    "image_url": "https://m.media-amazon.com/images/I/XXXXX.jpg",
    "asin": "BXXXXXXXXX",
    "url": "https://www.amazon.com/dp/BXXXXXXXXX",
    "badge": "Best value",
    "highlight": "one sentence why this is a great pick",
    "specs": ["key spec 1", "key spec 2", "key spec 3"]
  }
]

Important: Use real ASINs and image URLs from the search data if available. If image URL not found, use empty string.`
      }],
    });

    const formatText = formatResponse.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    console.log("[SEARCH] Format preview:", formatText.slice(0, 300));

    // Strip markdown code blocks if present
    const cleaned = formatText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();

    const match = cleaned.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("No JSON array in response");

    const products = JSON.parse(match[0]);
    console.log("[SEARCH] Got", products.length, "products");

    const spoken = products.map((p, i) =>
      `Option ${i + 1}: ${p.title} for ${p.price}, rated ${p.rating} stars${p.prime ? ", with free Prime shipping" : ""}.`
    ).join(" ");

    return {
      success: true,
      spoken: `Great news! I found ${products.length} options sorted by ${sortText}. ${spoken} I am texting you photos and details right now. Which number would you like?`,
      products,
    };

  } catch (err) {
    console.error("[SEARCH] Error:", err.message);
    return {
      success: false,
      spoken: "I had trouble with that search. Could you describe what you are looking for in a different way?",
      products: [],
    };
  }
}

module.exports = { searchProducts };
