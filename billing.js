// ═══════════════════════════════════════════════════════
//  ShopAgent Backend Server
//  Handles VAPI tool calls: search, SMS, order, tracking
// ═══════════════════════════════════════════════════════

require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());

const { searchProducts } = require("./tools/search");
const { sendProductSMS } = require("./tools/sms");
const { placeOrder } = require("./tools/order");
const { trackPackage } = require("./tools/tracking");
const { getBalance, deductMinutes } = require("./tools/billing");

// ── Health check ─────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "ShopAgent server running", version: "1.0.0" });
});

// ── VAPI Tool Call Handler ────────────────────────────
// VAPI sends POST to this URL when the AI calls a tool mid-conversation
app.post("/vapi/tools", async (req, res) => {
  const body = req.body;

  // VAPI wraps tool calls in a "message" object
  const message = body.message || body;
  const toolCalls = message.toolCallList || message.toolCalls || [];

  if (!toolCalls.length) {
    return res.json({ results: [] });
  }

  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const { id, function: fn } = toolCall;
      const name = fn?.name || toolCall.name;
      let args = {};
      try {
        args = typeof fn?.arguments === "string"
          ? JSON.parse(fn.arguments)
          : fn?.arguments || toolCall.parameters || {};
      } catch (e) {}

      console.log(`[TOOL CALL] ${name}`, args);

      let result;
      try {
        switch (name) {
          case "search_products":
            result = await searchProducts(args);
            break;
          case "send_sms":
            result = await sendProductSMS(args);
            break;
          case "place_order":
            result = await placeOrder(args);
            break;
          case "track_package":
            result = await trackPackage(args);
            break;
          case "get_balance":
            result = await getBalance(args);
            break;
          case "deduct_minutes":
            result = await deductMinutes(args);
            break;
          default:
            result = { error: `Unknown tool: ${name}` };
        }
      } catch (err) {
        console.error(`[ERROR] Tool ${name} failed:`, err.message);
        result = { error: err.message };
      }

      console.log(`[TOOL RESULT] ${name}:`, JSON.stringify(result).slice(0, 200));

      return {
        toolCallId: id || toolCall.id,
        result: JSON.stringify(result),
      };
    })
  );

  res.json({ results });
});

// ── VAPI Webhook (call events) ─────────────────────────
app.post("/vapi/webhook", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.sendStatus(200);

  const type = message.type;
  console.log(`[WEBHOOK] ${type}`);

  switch (type) {
    case "call-started":
      console.log(`Call started: ${message.call?.id}`);
      break;
    case "call-ended":
      const mins = Math.ceil((message.call?.duration || 0) / 60);
      console.log(`Call ended. Duration: ${message.call?.duration}s (${mins} min billed)`);
      // TODO: deduct from customer balance in your DB
      break;
    case "transcript":
      // live transcript — useful for logging
      break;
    default:
      break;
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ShopAgent server running on port ${PORT}`);
});
