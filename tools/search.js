require("dotenv").config();

async function searchProducts({ query, sort, max_price }) {
  const sortText = {
    price_low:    "lowest price first",
    best_reviews: "highest rated first",
    best_value:   "best value for money",
  }[sort] || "best value";

  const priceFilter = max_price ? ` under $${max_price}` : "";

  console.log("[SEARCH] Searching for:", query);

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2000,
      tools: [{ type: "web_search_20250305", name: "web_search" }],
      messages: [{
        role: "user",
        content: `Search Amazon for "${query}"${priceFilter} sorted by ${sortText}.

Find 3 real products currently available on Amazon. For each product return:
- title
- price (e.g. "$29.99")
- rating (e.g. "4.5")
- reviews (e.g. "2,341")
- prime (true/false)
- image_url (from m.media-amazon.com)
- asin
- url (https://www.amazon.com/dp/ASIN)
- highlight (why it matches)
- specs (3 bullet points)
- badge ("Best value", "Top rated", or "Lowest price")

Respond with ONLY a JSON array, starting with [ and ending with ]. No other text.`
      }],
    });

    console.log("[SEARCH] Stop reason:", response.stop_reason);

    const text = response.content
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    console.log("[SEARCH] Response preview:", text.slice(0, 300));

    // Try to extract JSON array
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const products = JSON.parse(match[0]);
        if (products && products.length > 0) {
          console.log("[SEARCH] Found", products.length, "products");
          const spoken = products.map((p, i) =>
            `Option ${i + 1}: ${p.title} for ${p.price}, rated ${p.rating} stars.`
          ).join(" ");
          return {
            success: true,
            spoken: `I found ${products.length} great options. ${spoken} I am sending you photos by text right now. Which number would you like?`,
            products,
          };
        }
      } catch(e) {
        console.error("[SEARCH] JSON parse error:", e.message);
      }
    }

    // Fallback — build results from web search content blocks
    const searchResults = response.content.filter(b => b.type === "tool_result" || b.type === "web_search_tool_result");
    console.log("[SEARCH] Search result blocks:", searchResults.length);

    // If no JSON, return a helpful spoken response with whatever we found
    return {
      success: false,
      spoken: "I found some results but had trouble formatting them. Let me try a different search. Could you give me a bit more detail about what you are looking for?",
      products: [],
    };

  } catch (err) {
    console.error("[SEARCH] Error:", err.message);
    return {
      success: false,
      spoken: "I had trouble searching right now. Please try again in a moment.",
      products: [],
    };
  }
}

module.exports = { searchProducts };
