require("dotenv").config();
const express = require("express");
const path = require("path");
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const { searchProducts } = require("./tools/search");
const { sendProductSMS } = require("./tools/sms");
const { placeOrder } = require("./tools/order");
const { trackPackage } = require("./tools/tracking");
const { getBalance, deductMinutes } = require("./tools/billing");

// Log all env vars on startup (masked) so we can debug
console.log("[ENV] DATABASE_URL:", process.env.DATABASE_URL ? "SET (" + process.env.DATABASE_URL.slice(0,30) + "...)" : "NOT SET");
console.log("[ENV] ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "SET" : "NOT SET");
console.log("[ENV] TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID ? "SET" : "NOT SET");

// Init DB with retry
async function initDbWithRetry(attempts = 5) {
  const db = require("./db");
  for (let i = 1; i <= attempts; i++) {
    try {
      await db.initDb();
      console.log("[DB] Connected successfully");
      return db;
    } catch (err) {
      console.error("[DB] Attempt " + i + " failed:", err.message);
      if (i < attempts) {
        console.log("[DB] Retrying in 3 seconds...");
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }
  console.error("[DB] All connection attempts failed — running without database");
  return null;
}

let dbReady = false;
initDbWithRetry().then(db => { if (db) dbReady = true; });

function getDb() {
  if (!dbReady) throw new Error("Database not ready yet");
  return require("./db");
}

// ── Health check ─────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "ShopAgent server running",
    version: "2.0.0",
    db: dbReady ? "connected" : "not connected",
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? "set" : "missing",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? "set" : "missing",
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? "set" : "missing",
    }
  });
});

// ── VAPI Tool Call Handler ────────────────────────────
app.post("/vapi/tools", async (req, res) => {
  const body = req.body;
  const message = body.message || body;
  const toolCalls = message.toolCallList || message.toolCalls || [];
  if (!toolCalls.length) return res.json({ results: [] });

  const results = await Promise.all(
    toolCalls.map(async (toolCall) => {
      const { id, function: fn } = toolCall;
      const name = fn ? fn.name : toolCall.name;
      let args = {};
      try {
        args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments || {};
      } catch (e) {}
      console.log("[TOOL]", name, JSON.stringify(args).slice(0, 200));
      let result;
      try {
        if (name === "search_products")    result = await searchProducts(args);
        else if (name === "send_sms")      result = await sendProductSMS(args);
        else if (name === "place_order")   result = await placeOrder(args);
        else if (name === "track_package") result = await trackPackage(args);
        else if (name === "get_balance")   result = await getBalance(args);
        else if (name === "deduct_minutes") result = await deductMinutes(args);
        else result = { error: "Unknown tool: " + name };
      } catch (err) {
        console.error("[ERROR]", name, err.message);
        result = { error: err.message };
      }
      return { toolCallId: id || toolCall.id, result: JSON.stringify(result) };
    })
  );
  res.json({ results });
});

// ── VAPI Webhook ──────────────────────────────────────
app.post("/vapi/webhook", async (req, res) => {
  const { message } = req.body;
  if (!message) return res.sendStatus(200);
  if (message.type === "call-ended" && dbReady) {
    const mins = Math.ceil((message.call?.duration || 0) / 60);
    const phone = message.call?.customer?.number;
    if (phone && mins > 0) {
      try {
        const db = getDb();
        await db.saveCall({
          call_id: message.call?.id,
          customer_phone: phone,
          duration_seconds: message.call?.duration || 0,
          minutes_billed: mins,
          outcome: "completed",
        });
      } catch (e) { console.error("[WEBHOOK] saveCall error:", e.message); }
    }
  }
  res.sendStatus(200);
});

// ══════════════════════════════════════════════════════
//  CUSTOMER PORTAL API
// ══════════════════════════════════════════════════════

app.get("/api/customer/:phone", async (req, res) => {
  try {
    const db = getDb();
    const customer = await db.getOrCreateCustomer(req.params.phone);
    const orders = await db.getOrders(req.params.phone);
    res.json({ customer, orders });
  } catch (err) {
    console.error("[API] get customer error:", err.message);
    res.status(503).json({ error: err.message, hint: "Database may still be connecting. Try again in a few seconds." });
  }
});

app.post("/api/customer/:phone/profile", async (req, res) => {
  try {
    const db = getDb();
    const { name, email } = req.body;
    await db.updateCustomer(req.params.phone, { name, email, status: "active" });
    res.json({ success: true });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.post("/api/topup/create-intent", async (req, res) => {
  try {
    const { phone, package_id } = req.body;
    const packages = {
      starter: { minutes: 15,  price: 999,  label: "15 minutes" },
      popular: { minutes: 30,  price: 1799, label: "30 minutes" },
      value:   { minutes: 60,  price: 2999, label: "60 minutes" },
      power:   { minutes: 120, price: 4999, label: "120 minutes" },
    };
    const pkg = packages[package_id];
    if (!pkg) return res.status(400).json({ error: "Invalid package" });

    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes("xxx")) {
      // Demo mode — add minutes directly
      if (dbReady) {
        const db = getDb();
        await db.addBalance(phone, pkg.minutes);
        await db.savePurchase(phone, pkg.minutes, pkg.price / 100, "demo_" + Date.now());
      }
      return res.json({ success: true, demo: true, minutes_added: pkg.minutes });
    }

    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const db = getDb();
    const customer = await db.getOrCreateCustomer(phone);
    let stripeCustomerId = customer.stripe_customer_id;
    if (!stripeCustomerId) {
      const sc = await stripe.customers.create({ phone, metadata: { shopagent_phone: phone } });
      stripeCustomerId = sc.id;
      await db.updateCustomer(phone, { stripe_customer_id: stripeCustomerId });
    }
    const intent = await stripe.paymentIntents.create({
      amount: pkg.price, currency: "usd", customer: stripeCustomerId,
      metadata: { phone, package_id, minutes: pkg.minutes },
      description: "ShopAgent: " + pkg.label,
    });
    res.json({ client_secret: intent.client_secret, package: pkg });
  } catch (err) {
    console.error("[API] topup error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/topup/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === "payment_intent.succeeded") {
      const pi = event.data.object;
      const { phone, minutes } = pi.metadata;
      if (phone && minutes && dbReady) {
        const db = getDb();
        await db.savePurchase(phone, parseInt(minutes), pi.amount / 100, pi.id);
      }
    }
    res.sendStatus(200);
  } catch (err) {
    res.status(400).send("Webhook error: " + err.message);
  }
});

app.get("/api/admin/customers", async (req, res) => {
  try {
    const db = getDb();
    res.json(await db.getAllCustomers());
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

app.post("/api/admin/add-minutes", async (req, res) => {
  try {
    const db = getDb();
    const newBalance = await db.addBalance(req.body.phone, req.body.minutes);
    res.json({ success: true, new_balance: newBalance });
  } catch (err) {
    res.status(503).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("ShopAgent v2 running on port " + PORT));
