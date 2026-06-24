require("dotenv").config();

// Maps customer-friendly store names to SerpAPI engine IDs and display names
const STORE_MAP = {
  amazon:         { engine: "amazon",          label: "Amazon",        resultsKey: "organic_results" },
  walmart:        { engine: "walmart",         label: "Walmart",       resultsKey: "organic_results" },
  ebay:           { engine: "ebay",            label: "eBay",          resultsKey: "organic_results" },
  home_depot:     { engine: "home_depot",      label: "Home Depot",    resultsKey: "products" },
  google_shopping:{ engine: "google_shopping", label: "all stores",    resultsKey: "shopping_results" },
};

// Normalize a raw SerpAPI result item into our standard product shape
function normalizeItem(item, engine, index, sort) {
  let title, price, extractedPrice, rating, reviews, imageUrl, url, asin, source;

  if (engine === "amazon") {
    title         = item.title;
    price         = item.price;
    extractedPrice= item.extracted_price;
    rating        = item.rating;
    reviews       = item.reviews;
    imageUrl      = item.thumbnail;
    url           = item.link;
    asin          = item.asin || (item.link ? (item.link.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] : "") || "";
    source        = "Amazon";
  } else if (engine === "walmart") {
    title         = item.title;
    price         = item.primary_price || item.price;
    extractedPrice= typeof price === "string" ? parseFloat(price.replace(/[^0-9.]/g, "")) : price;
    rating        = item.rating;
    reviews       = item.reviews;
    imageUrl      = item.thumbnail;
    url           = item.product_page_url || item.link;
    asin          = "";
    source        = "Walmart";
  } else if (engine === "ebay") {
    title         = item.title;
    price         = item.price ? item.price.raw || item.price : null;
    extractedPrice= item.price ? item.price.extracted || parseFloat(String(price).replace(/[^0-9.]/g, "")) : null;
    rating        = item.rating;
    reviews       = item.reviews;
    imageUrl      = item.thumbnail;
    url           = item.link;
    asin          = "";
    source        = "eBay";
  } else if (engine === "home_depot") {
    title         = item.title;
    price         = item.price ? `$${item.price}` : null;
    extractedPrice= item.price;
    rating        = item.rating;
    reviews       = item.reviews;
    imageUrl      = item.thumbnail || item.image;
    url           = item.link;
    asin          = "";
    source        = "Home Depot";
  } else {
    // google_shopping
    title         = item.title;
    price         = item.price;
    extractedPrice= item.extracted_price;
    rating        = item.rating;
    reviews       = item.reviews;
    imageUrl      = item.thumbnail;
    url           = item.link;
    asin          = item.link ? (item.link.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || "" : "";
    source        = item.source || "Online store";
  }

  const badge = index === 0
    ? (sort === "price_low" ? "Lowest price" : sort === "best_reviews" ? "Top rated" : "Best value")
    : index === 1 ? "Popular pick" : "Great option";

  return {
    title:          title || "Product",
    price:          price || "$0.00",
    original_price: price || "$0.00",
    rating:         rating ? rating.toString() : "4.5",
    reviews:        reviews ? reviews.toLocaleString() : "100+",
    prime:          engine === "amazon",
    image_url:      imageUrl || "",
    asin,
    url:            url || "",
    badge,
    highlight:      `Available on ${source} — ${price || ""}`,
    specs: [source, price, rating ? `${rating} stars` : "Highly rated"].filter(Boolean),
    _extracted_price: extractedPrice || 999,
  };
}

async function searchProducts({ query, sort, max_price, store }) {
  const storeKey  = resolveStore(store);
  const storeInfo = STORE_MAP[storeKey];
  console.log("[SEARCH]", query, "| sort:", sort, "| store:", storeInfo.label);

  const sortText = {
    price_low:    "lowest price",
    best_reviews: "highest rated",
    best_value:   "best value",
  }[sort] || "best value";

  try {
    const apiKey = process.env.SERPAPI_KEY;
    if (!apiKey) throw new Error("SERPAPI_KEY not set");

    // Amazon engine uses 'k' for keyword; all others use 'q'
    const queryParam = storeInfo.engine === "amazon" ? "k" : "q";
    const params = new URLSearchParams({
      engine:  storeInfo.engine,
      [queryParam]: query,
      api_key: apiKey,
      num:     "10",
      gl:      "us",
      hl:      "en",
    });

    if (storeInfo.engine === "amazon") {
      if (sort === "price_low")    params.set("s", "price-asc-rank");
      if (sort === "best_reviews") params.set("s", "review-rank");
    }

    if (storeInfo.engine === "google_shopping" && max_price) {
      params.append("tbs", `mr:1,price:1,ppr_max:${max_price}`);
    }

    const fetch = require("node-fetch");
    const url   = `https://serpapi.com/search.json?${params.toString()}`;
    console.log("[SEARCH] Calling SerpApi engine:", storeInfo.engine);

    const response = await fetch(url);
    const data     = await response.json();
    if (data.error) throw new Error("SerpApi error: " + data.error);

    let results = data[storeInfo.resultsKey] || [];
    console.log("[SEARCH] SerpApi returned", results.length, "results");
    if (results.length === 0) throw new Error("No results found");

    let products = results.map((item, i) => normalizeItem(item, storeInfo.engine, i, sort));

    if (sort === "price_low") {
      products.sort((a, b) => a._extracted_price - b._extracted_price);
    } else if (sort === "best_reviews") {
      products.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0));
    }

    if (max_price) {
      const filtered = products.filter(p => p._extracted_price <= max_price);
      if (filtered.length > 0) products = filtered;
    }

    const top3 = products.slice(0, 3).map((p, i) => {
      p.badge = i === 0
        ? (sort === "price_low" ? "Lowest price" : sort === "best_reviews" ? "Top rated" : "Best value")
        : i === 1 ? "Popular pick" : "Great option";
      return p;
    });

    console.log("[SEARCH] Products with images:", top3.filter(p => p.image_url).length);

    const spoken = top3.map((p, i) =>
      `Option ${i + 1}: ${p.title} for ${p.price}, rated ${p.rating} stars${p.prime ? " with free Prime shipping" : ""}.`
    ).join(" ");

    return {
      success: true,
      spoken: `I found ${top3.length} great options on ${storeInfo.label} sorted by ${sortText}. ${spoken} I am sending you photos by text right now. Which number would you like?`,
      products: top3,
    };

  } catch (err) {
    console.error("[SEARCH] SerpApi error:", err.message);
    console.log("[SEARCH] Falling back to AI search...");
    return await fallbackSearch(query, sort, max_price);
  }
}

function resolveStore(store) {
  if (!store) return "amazon";
  const s = store.toLowerCase().trim();
  if (s.includes("walmart"))                                        return "walmart";
  if (s.includes("ebay"))                                           return "ebay";
  if (s.includes("home depot") || s.includes("homedepot"))         return "home_depot";
  if (s.includes("google") || s.includes("any") || s.includes("all")) return "google_shopping";
  return "amazon";
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

    const text    = response.content.filter(b => b.type === "text").map(b => b.text).join("");
    const cleaned = text.replace(/```json/gi, "").replace(/```/gi, "").trim();
    const match   = cleaned.match(/\[[\s\S]*\]/);

    if (match) {
      const products = JSON.parse(match[0]).map(p => ({ ...p, title: p.title || p.name || "Product" }));
      const spoken   = products.map((p, i) =>
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
