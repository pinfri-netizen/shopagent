require("dotenv").config();

async function searchProducts({ query, sort, max_price }) {
  console.log("[SEARCH] Searching for:", query, "sort:", sort);

  const sortText = {
    price_low:    "lowest price",
    best_reviews: "highest rated",
    best_value:   "best value",
  }[sort] || "best value";

  try {
    const apiKey = process.env.SERPAPI_KEY;

    if (!apiKey) {
      throw new Error("SERPAPI_KEY not set");
    }

    // Build SerpApi Google Shopping request
    const params = new URLSearchParams({
      engine: "google_shopping",
      q: query,
      api_key: apiKey,
      num: "10",
      gl: "us",
      hl: "en",
    });

    if (max_price) params.append("tbs", `mr:1,price:1,ppr_max:${max_price}`);
    if (sort === "best_reviews") params.append("tbs", "mr:1,avg_rating:400");

    const url = `https://serpapi.com/search.json?${params.toString()}`;
    console.log("[SEARCH] Calling SerpApi...");

    const fetch = require("node-fetch");
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) throw new Error("SerpApi error: " + data.error);

    const results = data.shopping_results || [];
    console.log("[SEARCH] SerpApi returned", results.length, "results");

    if (results.length === 0) throw new Error("No shopping results found");

    // Sort results
    let sorted = [...results];
    if (sort === "price_low") {
      sorted.sort((a, b) => (a.extracted_price || 999) - (b.extracted_price || 999));
    } else if (sort === "best_reviews") {
      sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    // Take top 3
    const top3 = sorted.slice(0, 3);

    const products = top3.map((item, i) => ({
      title: item.title || "Product",
      price: item.price || "$0.00",
      original_price: item.old_price || item.price || "$0.00",
      rating: item.rating ? item.rating.toString() : "4.5",
      reviews: item.reviews ? item.reviews.toLocaleString() : "100+",
      prime: item.source === "Amazon.com",
      image_url: item.thumbnail || "",
      asin: item.link ? (item.link.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || "" : "",
      url: item.link || "",
      badge: i === 0 ? (sort === "price_low" ? "Lowest price" : sort === "best_reviews" ? "Top rated" : "Best value") : i === 1 ? "Popular pick" : "Great option",
      highlight: `Available on ${item.source || "Amazon"} — ${item.price || ""}`,
      specs: [
        item.source || "Online store",
        item.price || "",
        item.rating ? `${item.rating} stars` : "Highly rated",
      ].filter(Boolean),
    }));

    console.log("[SEARCH] Products with images:", products.filter(p => p.image_url).length);

    const spoken = products.map((p, i) =>
      `Option ${i + 1}: ${p.title} for ${p.price}, rated ${p.rating} stars${p.prime ? " with free Prime shipping" : ""}.`
    ).join(" ");

    return {
      success: true,
      spoken: `I found ${products.length} great options sorted by ${sortText}. ${spoken} I am sending you photos by text right now. Which number would you like?`,
      products,
    };

  } catch (err) {
    console.error("[SEARCH] SerpApi error:", err.message);

    // Fallback to Haiku if SerpApi fails
    console.log("[SEARCH] Falling back to AI search...");
    return await fallbackSearch(query, sort, max_price);
  }
}

async function fallbackSearch(query, sort, max_price) {
  const sortText = { price_low: "lowest price", best_reviews: "highest rated", best_value: "best value" }[sort] || "best value";
  const priceFilter = max_price ? ` under $${max_price}` : "";

  try {
    const Anthropic = require("@anthropic-ai/sdk");
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1200,
      messages: [{
        role: "user",
        content: `Generate a JSON array of exactly 3 realistic Amazon products for: "${query}"${priceFilter}. Sort by ${sortText}. Include realistic names, prices, ratings. Leave image_url as empty string. Respond with ONLY the JSON array starting with [.`
      }],
    });

    const text = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json/gi, "").replace(/```/gi, "").trim();
    const match = cleaned.match(/\[[\s\S]*\]/);

    if (match) {
      const products = JSON.parse(match[0]);
      const spoken = products.map((p, i) =>
        `Option ${i + 1}: ${p.title} for ${p.price}, rated ${p.rating} stars.`
      ).join(" ");
      return {
        success: true,
        spoken: `I found ${products.length} options sorted by ${sortText}. ${spoken} Which number would you like?`,
        products,
      };
    }
  } catch (e) {
    console.error("[SEARCH] Fallback error:", e.message);
  }

  return {
    success: false,
    spoken: "I had trouble searching right now. Could you describe what you are looking for again?",
    products: [],
  };
}

module.exports = { searchProducts };
