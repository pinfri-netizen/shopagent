require("dotenv").config();
const express = require("express");
const app = express();
app.use(express.json());

const { searchProducts } = require("./tools/search");
const { sendProductSMS } = require("./tools/sms");
const { placeOrder } = require("./tools/order");
const { trackPackage } = require("./tools/tracking");
const { getBalance, deductMinutes } = require("./tools/billing");

app.get("/", (req, res) => {
  res.json({ status: "ShopAgent server running", version: "1.0.0" });
});

app.post("/vapi/tools", async (req, res) => {
  const body = req.body;
  const message = body.message || body;
  const toolCalls = message.toolCallList || message.toolCalls || [];

  if (!toolCalls.length) {
    return res.json({ results: [] });
  }

  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const { id, function: fn } = toolCall;
      const name = fn ? fn.name : toolCall.name;
      let args = {};
      try {
        args = typeof fn.arguments === "string"
          ? JSON.parse(fn.arguments)
          : fn.arguments || {};
      } catch (e) {}

      console.log("[TOOL CALL]", name, JSON.stringify(args).slice(0, 200));

      let result;
      try {
        if (name === "search_products")  result = await searchProducts(args);
        else if (name === "send_sms")    result = await sendProductSMS(args);
        else if (name === "place_order") result = await placeOrder(args);
        else if (name === "track_package") result = await trackPackage(args);
        else if (name === "get_balance") result = await getBalance(args);
        else if (name === "deduct_minutes") result = await deductMinutes(args);
        else result = { error: "Unknown tool: " + name };
      } catch (err) {
        console.error("[ERROR]", name, err.message);
        result = { error: err.message };
      }

      console.log("[TOOL RESULT]", name, JSON.stringify(result).slice(0, 200));
      return { toolCallId: id || toolCall.id, result: JSON.stringify(result) };
    })
  );

  res.json({ results });
});

app.post("/vapi/webhook", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.sendStatus(200);
  console.log("[WEBHOOK]", message.type);
  if (message.type === "call-ended") {
    const mins = Math.ceil((message.call && message.call.duration || 0) / 60);
    console.log("Call ended. Mins:", mins);
  }
  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("ShopAgent server on port " + PORT));
