require("dotenv").config();

// Approximate cost constants (fallback estimates when live VAPI data unavailable)
const COSTS = {
  VAPI_PER_MINUTE: 0.05,
  ANTHROPIC_SEARCH: 0.001,
  ANTHROPIC_CONVERSATION_PER_MIN: 0.015,
  PINGRAM_SMS: 0.01,
  ZINC_PER_ORDER: 1.00,
  STRIPE_PERCENT: 0.029,
  STRIPE_FLAT: 0.30,
};

let dbModule = null;
function getDb() {
  if (!dbModule) dbModule = require("../db");
  return dbModule;
}

async function logCostEvent(callId, customerPhone, eventType, provider, cost, details) {
  try {
    const db = getDb();
    const p = db.getPool ? db.getPool() : db.pool;
    await p.query(
      "INSERT INTO cost_events (call_id, customer_phone, event_type, provider, cost, details) VALUES ($1, $2, $3, $4, $5, $6)",
      [callId, customerPhone, eventType, provider, cost, details || ""]
    );
    console.log("[COST]", provider, eventType, "$" + cost.toFixed(4), customerPhone || "");
  } catch (err) {
    console.error("[COST] Log error:", err.message);
  }
}

async function logSearch(callId, phone) {
  await logCostEvent(callId, phone, "search", "anthropic", COSTS.ANTHROPIC_SEARCH, "Haiku product search");
}

async function logSms(callId, phone, count) {
  const cost = COSTS.PINGRAM_SMS * (count || 1);
  await logCostEvent(callId, phone, "sms", "pingram", cost, count + " messages sent");
}

async function logZincOrder(callId, phone, orderId) {
  await logCostEvent(callId, phone, "order", "zinc", COSTS.ZINC_PER_ORDER, "Order: " + orderId);
}

async function logStripeCharge(callId, phone, amountCents) {
  const amount = amountCents / 100;
  const fee = (amount * COSTS.STRIPE_PERCENT) + COSTS.STRIPE_FLAT;
  await logCostEvent(callId, phone, "payment_processing", "stripe", fee, "Charge: $" + amount.toFixed(2));
}

// Fetch real cost breakdown from VAPI's API for a given call
async function fetchVapiCallCost(callId) {
  if (!process.env.VAPI_API_KEY || !callId || callId === "unknown") return null;
  try {
    const fetch = require("node-fetch");
    const res = await fetch("https://api.vapi.ai/call/" + callId, {
      headers: { "Authorization": "Bearer " + process.env.VAPI_API_KEY }
    });
    if (!res.ok) {
      console.error("[COST] VAPI API error status:", res.status);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error("[COST] VAPI API fetch error:", err.message);
    return null;
  }
}

async function logCallCost(callId, phone, durationSeconds, minutesBilled, revenuePerMinute) {
  const minutes = durationSeconds / 60;
  let vapiCost = minutes * COSTS.VAPI_PER_MINUTE;
  let anthropicCost = minutes * COSTS.ANTHROPIC_CONVERSATION_PER_MIN;
  let usedLiveData = false;

  const vapiData = await fetchVapiCallCost(callId);

  if (vapiData && typeof vapiData.cost === "number" && vapiData.cost > 0) {
    const breakdown = vapiData.costBreakdown || {};
    vapiCost = (breakdown.transport || 0) + (breakdown.vapi || 0);
    anthropicCost = breakdown.llm || anthropicCost;
    const sttCost = breakdown.stt || 0;
    const ttsCost = breakdown.tts || 0;

    await logCostEvent(callId, phone, "stt", "vapi", sttCost, "Speech-to-text");
    await logCostEvent(callId, phone, "tts", "vapi", ttsCost, "Text-to-speech");
    usedLiveData = true;
    console.log("[COST] Live VAPI cost data:", JSON.stringify(breakdown));
  } else {
    console.log("[COST] No live VAPI cost data (free credits or API unavailable) — using estimate");
  }

  await logCostEvent(callId, phone, "call_infra", "vapi", vapiCost, minutes.toFixed(1) + " min" + (usedLiveData ? " (live)" : " (est)"));
  await logCostEvent(callId, phone, "call_ai", "anthropic", anthropicCost, minutes.toFixed(1) + " min" + (usedLiveData ? " (live)" : " (est)"));

  try {
    const db = getDb();
    const p = db.getPool ? db.getPool() : db.pool;
    const result = await p.query(
      "SELECT COALESCE(SUM(cost), 0) as total_cost FROM cost_events WHERE call_id = $1",
      [callId]
    );
    const totalCost = parseFloat(result.rows[0].total_cost);
    const revenue = (revenuePerMinute || 0.60) * minutesBilled;
    const profit = revenue - totalCost;

    await p.query(
      "UPDATE calls SET total_cost = $2, revenue = $3, profit = $4, vapi_cost = $5, anthropic_cost = $6 WHERE call_id = $1",
      [callId, totalCost, revenue, profit, vapiCost, anthropicCost]
    );

    console.log("[COST] Call summary —", callId, "Cost: $" + totalCost.toFixed(4), "Revenue: $" + revenue.toFixed(4), "Profit: $" + profit.toFixed(4), usedLiveData ? "[LIVE]" : "[EST]");
  } catch (err) {
    console.error("[COST] Summary error:", err.message);
  }
}

module.exports = {
  COSTS,
  logCostEvent,
  logSearch,
  logSms,
  logZincOrder,
  logStripeCharge,
  logCallCost,
  fetchVapiCallCost,
};
