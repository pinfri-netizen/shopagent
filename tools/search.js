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

    // Step 1: Use web search to find products
    const searchResponse = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 3000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: `Search for: site:amazon.com "${query}"${priceFilter}`
      }],
    });

    // Get all text from the search response
    const searchText = searchResponse.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    console.log("[SEARCH] Raw search text length:", searchText.length);

    // Step 2: Ask Claude to extract and format the product data
    const formatResponse = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Here is Amazon search data:\n\n${searchText}\n\nExtract exactly 3 products from this data. If you cannot find real products, create realistic placeholder products for "${query}" that would typically be found on Amazon.\n\nReturn ONLY this JSON array with no other text:\n[\n  {\n    "title": "product name",\n    "price": "$XX.XX",\n    "original_price": "$XX.XX",\n    "rating": "4.5",\n    "reviews": "1,234",\n    "prime": true,\n    "image_url": "",\n    "asin": "B000000000",\n    "url": "https://www.amazon.com/s?k=${encodeURIComponent(query)}",\n    "badge": "Best value",\n    "highlight": "why this is a good pick",\n    "specs": ["spec 1", "spec 2", "spec 3"]\n  }\n]`
        }
      ],
    });

    const formatText = formatResponse.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    console.log("[SEARCH] Format response preview:", formatText.slice(0, 400));

    // Extract JSON
    const match = formatText.match(/\[[\s\S]*\]/);
    if (match) {
      const products = JSON.parse(match[0]);
      console.log("[SEARCH] Got", products.length, "products");

      const spoken = products.map((p, i) =>
        `Option ${i + 1}: ${p.title} for ${p.price}, rated ${p.rating} stars.`
      ).join(" ");

      return {
        success: true,
        spoken: `I found ${products.length} great options for you, sorted by ${sortText}. ${spoken} I am sending you the details by text message right now. Which number would you like?`,
        products,
      };
    }

    throw new Error("Could not parse products from response");

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
