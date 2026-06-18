require("dotenv").config();
const express = require("express");
const path = require("path");
const app = express();

app.use((req, res, next) => {
  if (req.path === "/api/topup/webhook") return next();
  express.json({ limit: "10mb" })(req, res, next);
});
app.use(express.static(path.join(__dirname, "public")));

const { searchProducts } = require("./tools/search");
const { sendProductSMS } = require("./tools/sms");
const { placeOrder } = require("./tools/order");
const { trackPackage } = require("./tools/tracking");
const { getBalance, deductMinutes } = require("./tools/billing");
const costTracking = require("./tools/costTracking");
let topupByPhone;
try {
  topupByPhone = require("./tools/topup").topupByPhone;
} catch(e) {
  try {
    topupByPhone = require("./topup").topupByPhone;
  } catch(e2) {
    console.warn("[WARN] topup.js not found — topup disabled");
    topupByPhone = async () => ({ success: false, spoken: "Top up is not available right now." });
  }
}

console.log("[ENV] DATABASE_URL:", process.env.DATABASE_URL ? "SET" : "NOT SET");
console.log("[ENV] ANTHROPIC_API_KEY:", process.env.ANTHROPIC_API_KEY ? "SET" : "NOT SET");
console.log("[ENV] TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID ? "SET" : "NOT SET");

// Simple global cache — persists phone and products between tool calls
var lastPhone = null;
var lastProducts = null;

function cachePhone(phone) {
  if (phone) {
    lastPhone = phone.replace(/[^0-9]/g, "");
    console.log("[CACHE] Stored phone:", lastPhone);
  }
}
function cacheProducts(products) {
  if (products && products.length > 0) {
    lastProducts = products;
    console.log("[CACHE] Stored", products.length, "products");
  }
}
function getCachedPhone() {
  console.log("[CACHE] Getting phone:", lastPhone);
  return lastPhone;
}
function getCachedProducts() {
  console.log("[CACHE] Getting products:", lastProducts ? lastProducts.length : 0);
  return lastProducts;
}

// Start server immediately
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("ShopAgent v2 running on port " + PORT));

// Init DB in background
var dbReady = false;
var dbModule = null;

function initDb() {
  try {
    dbModule = require("./db");
    dbModule.initDb().then(function() {
      dbReady = true;
      console.log("[DB] Ready");
    }).catch(function(err) {
      console.error("[DB] Init error:", err.message);
      setTimeout(initDb, 5000);
    });
  } catch(err) {
    console.error("[DB] Require error:", err.message);
    setTimeout(initDb, 5000);
  }
}
initDb();

function db() {
  if (!dbModule) throw new Error("Database not connected yet");
  return dbModule;
}

// Health check
app.get("/health", function(req, res) {
  res.json({ status: "ok", version: "2.0.0", db: dbReady ? "connected" : "connecting" });
});

// Test search
app.get("/api/test-search", async function(req, res) {
  try {
    var result = await searchProducts({ query: "drone for kids", sort: "best_value" });
    res.json({ success: true, result });
  } catch(err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// VAPI Tools
app.post("/vapi/tools", async function(req, res) {
  // Log full structure to find caller ID location
  const bodyStr = JSON.stringify(req.body);
  console.log("[VAPI] Incoming request body:", bodyStr.slice(0, 300));
  
  // Try to find caller phone in multiple VAPI locations
  var callerPhone = null;
  try { callerPhone = req.body.message.call.customer.number; } catch(e) {}
  try { if (!callerPhone) callerPhone = req.body.message.artifact.messages[0].call?.customer?.number; } catch(e) {}
  try { if (!callerPhone) callerPhone = req.body.call?.customer?.number; } catch(e) {}
  try { if (!callerPhone) callerPhone = req.body.customer?.number; } catch(e) {}
  
  if (callerPhone) {
    console.log("[VAPI] Found caller phone:", callerPhone);
    cachePhone(callerPhone);
  } else {
    console.log("[VAPI] No caller phone in message — will use spoken number");
  }

  var body = req.body || {};
  var toolCalls = [];

  if (body.message && body.message.toolCallList) toolCalls = body.message.toolCallList;
  else if (body.message && body.message.toolCalls) toolCalls = body.message.toolCalls;
  else if (body.toolCallList) toolCalls = body.toolCallList;
  else if (body.toolCalls) toolCalls = body.toolCalls;

  console.log("[VAPI] Tool calls found:", toolCalls.length);

  if (!toolCalls.length) return res.json({ results: [] });

  var callId = (body.message && body.message.call && body.message.call.id) || "unknown";

  var results = await Promise.all(toolCalls.map(async function(tc) {
    var name = tc.function ? tc.function.name : tc.name;
    var args = {};
    try {
      args = typeof tc.function.arguments === "string"
        ? JSON.parse(tc.function.arguments)
        : tc.function.arguments || {};
    } catch(e) {}

    console.log("[TOOL CALL] name:", name, "args:", JSON.stringify(args).slice(0, 200));

    var result;
    try {
      if (name === "get_balance") {
        // Always use caller phone from VAPI if available — override what agent passes
        if (callerPhone) {
          const callerDigits = callerPhone.replace(/[^0-9]/g, "");
          const argDigits = (args.phone_number || "").replace(/[^0-9]/g, "");
          // Use caller ID if agent didn't pass anything, or if they match last digits
          if (!args.phone_number || argDigits.slice(-7) === callerDigits.slice(-7)) {
            args.phone_number = callerPhone;
            console.log("[BALANCE] Using caller ID:", callerPhone);
          }
        }
        result = await getBalance(args);
        if (args.phone_number) cachePhone(args.phone_number);
        if (result.customer_phone) cachePhone(result.customer_phone);
      }
      else if (name === "search_products") {
        result = await searchProducts(args);
        if (result.success && result.products) cacheProducts(result.products);
        costTracking.logSearch(callId, getCachedPhone()).catch(()=>{});
      }
      else if (name === "send_sms") {
        if (!args.to_number) args.to_number = getCachedPhone();
        if (!args.products || args.products.length === 0) args.products = getCachedProducts();
        result = await sendProductSMS(args);
        if (result.success) costTracking.logSms(callId, args.to_number, (args.products||[]).length + 1).catch(()=>{});
      }
      else if (name === "place_order") {
        result = await placeOrder(args);
        if (result.success && result.order_id) costTracking.logZincOrder(callId, args.customer_phone, result.order_id).catch(()=>{});
      }
      else if (name === "track_package")  result = await trackPackage(args);
      else if (name === "deduct_minutes") result = await deductMinutes(args);
      else if (name === "topup_by_phone") result = await topupByPhone(args);
      else result = { error: "Unknown tool: " + name };
    } catch(err) {
      console.error("[TOOL ERROR]", name, err.message);
      result = { error: err.message };
    }

    console.log("[TOOL RESULT]", name, JSON.stringify(result).slice(0, 200));
    return { toolCallId: tc.id, result: JSON.stringify(result) };
  }));

  res.json({ results: results });
});

// VAPI Webhook
app.post("/vapi/webhook", async function(req, res) {
  var message = (req.body || {}).message;
  if (!message) return res.sendStatus(200);
  console.log("[WEBHOOK]", message.type);

  // Call started — pre-cache the caller's phone and balance
  if (message.type === "call-started" || message.type === "status-update") {
    var phone = null;
    try { phone = message.call.customer.number; } catch(e) {}
    try { if (!phone) phone = req.body.call.customer.number; } catch(e) {}
    if (phone) {
      cachePhone(phone);
      console.log("[WEBHOOK] Call started — pre-caching phone:", phone);
      // Pre-load balance into cache so first tool call is instant
      try {
        var balResult = await getBalance({ phone_number: phone });
        cachePhone(phone);
        console.log("[WEBHOOK] Pre-loaded balance:", balResult.balance, "mins");
      } catch(e) { console.error("[WEBHOOK] Pre-load error:", e.message); }
    }
  }

  if (message.type === "end-of-call-report" && dbReady) {
    var durationSec = (message.durationSeconds || (message.call || {}).duration || 0);
    var mins = Math.ceil(durationSec / 60);
    var phone = ((message.call || {}).customer || {}).number || getCachedPhone();
    console.log("[WEBHOOK] Call ended. Duration:", durationSec, "s =", mins, "min. Phone:", phone);
    if (phone && mins > 0) {
      try {
        await db().saveCall({
          call_id: (message.call || {}).id,
          customer_phone: phone,
          duration_seconds: durationSec,
          minutes_billed: mins,
          outcome: "completed",
        });
        var newBal = await db().deductBalance(phone, mins);
        console.log("[WEBHOOK] Deducted", mins, "min from", phone, "- new balance:", newBal);

        // Log call infra cost and compute profit summary
        var callIdForCost = (message.call || {}).id || "unknown";
        // VAPI needs a few seconds after call end to finalize cost data
        setTimeout(function() {
          costTracking.logCallCost(callIdForCost, phone, durationSec, mins, 0.60).catch(function(e) {
            console.error("[COST] Delayed cost log error:", e.message);
          });
        }, 8000);
      } catch(e) { console.error("[WEBHOOK] Deduct error:", e.message); }
    }
  }
  res.sendStatus(200);
});

// Customer API
app.get("/api/customer/:phone", async function(req, res) {
  try {
    var customer = await db().getOrCreateCustomer(req.params.phone);
    var orders = await db().getOrders(req.params.phone);
    res.json({ customer: customer, orders: orders });
  } catch(err) {
    res.status(503).json({ error: err.message });
  }
});

app.post("/api/customer/:phone/profile", async function(req, res) {
  try {
    await db().updateCustomer(req.params.phone, { name: req.body.name, email: req.body.email, status: "active" });
    res.json({ success: true });
  } catch(err) {
    res.status(503).json({ error: err.message });
  }
});

// Top up
app.post("/api/topup/create-intent", async function(req, res) {
  try {
    var phone = req.body.phone;
    var package_id = req.body.package_id;
    var packages = {
      starter: { minutes: 15,  price: 999,  label: "15 minutes" },
      popular: { minutes: 30,  price: 1799, label: "30 minutes" },
      value:   { minutes: 60,  price: 2999, label: "60 minutes" },
      power:   { minutes: 120, price: 4999, label: "120 minutes" },
    };
    var pkg = packages[package_id];
    if (!pkg) return res.status(400).json({ error: "Invalid package" });

    if (!process.env.STRIPE_SECRET_KEY) {
      await db().addBalance(phone, pkg.minutes);
      await db().savePurchase(phone, pkg.minutes, pkg.price / 100, "demo_" + Date.now());
      return res.json({ success: true, demo: true, minutes_added: pkg.minutes });
    }

    var stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    var customer = await db().getOrCreateCustomer(phone);
    var scId = customer.stripe_customer_id;
    if (!scId) {
      var sc = await stripe.customers.create({ phone: phone, metadata: { phone: phone } });
      scId = sc.id;
      await db().updateCustomer(phone, { stripe_customer_id: scId });
    }
    var intent = await stripe.paymentIntents.create({
      amount: pkg.price, currency: "usd", customer: scId,
      metadata: { phone: phone, package_id: package_id, minutes: String(pkg.minutes) },
      description: "ShopAgent: " + pkg.label,
    });
    res.json({ client_secret: intent.client_secret, package: pkg });
  } catch(err) {
    console.error("[TOPUP]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/topup/webhook", express.raw({ type: "application/json" }), async function(req, res) {
  try {
    var stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    var event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === "payment_intent.succeeded") {
      var pi = event.data.object;
      var phone = pi.metadata.phone;
      var minutes = pi.metadata.minutes;
      if (phone && minutes) await db().savePurchase(phone, parseInt(minutes), pi.amount / 100, pi.id);
    }
    res.sendStatus(200);
  } catch(err) {
    res.status(400).send("Webhook error: " + err.message);
  }
});

app.get("/api/admin/customers", async function(req, res) {
  try { res.json(await db().getAllCustomers()); }
  catch(err) { res.status(503).json({ error: err.message }); }
});

// Admin dashboard summary stats
app.get("/api/admin/stats", async function(req, res) {
  try {
    var p = db().getPool ? db().getPool() : db().pool;
    var customers = await p.query("SELECT COUNT(*) as total, SUM(CASE WHEN status != \'new\' THEN 1 ELSE 0 END) as active, SUM(balance_minutes) as total_minutes, SUM(total_spent) as total_revenue FROM customers");
    var orders = await p.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = \'processing\' THEN 1 ELSE 0 END) as processing FROM orders");
    var recentOrders = await p.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 10");
    var recentCustomers = await p.query("SELECT * FROM customers ORDER BY created_at DESC LIMIT 10");
    var callStats = await p.query("SELECT COUNT(*) as total_calls, SUM(minutes_billed) as total_minutes_used FROM calls");

    res.json({
      customers: customers.rows[0],
      orders: orders.rows[0],
      calls: callStats.rows[0],
      recentOrders: recentOrders.rows,
      recentCustomers: recentCustomers.rows,
    });
  } catch(err) {
    console.error("[ADMIN STATS]", err.message);
    res.status(503).json({ error: err.message });
  }
});

// Admin - get all orders
app.get("/api/admin/orders", async function(req, res) {
  try {
    var p = db().getPool ? db().getPool() : db().pool;
    var result = await p.query("SELECT * FROM orders ORDER BY created_at DESC LIMIT 100");
    res.json(result.rows);
  } catch(err) {
    res.status(503).json({ error: err.message });
  }
});

// Admin - get all calls
app.get("/api/admin/calls", async function(req, res) {
  try {
    var p = db().getPool ? db().getPool() : db().pool;
    var result = await p.query("SELECT * FROM calls ORDER BY created_at DESC LIMIT 100");
    res.json(result.rows);
  } catch(err) {
    res.status(503).json({ error: err.message });
  }
});

// Admin - cost & profit breakdown
app.get("/api/admin/costs", async function(req, res) {
  try {
    var p = db().getPool ? db().getPool() : db().pool;

    // Overall totals
    var totals = await p.query(`
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(revenue), 0) as total_revenue,
        COALESCE(SUM(profit), 0) as total_profit,
        COUNT(*) as call_count
      FROM calls
    `);

    // Cost breakdown by provider
    var byProvider = await p.query(`
      SELECT provider, event_type, COUNT(*) as count, COALESCE(SUM(cost), 0) as total
      FROM cost_events
      GROUP BY provider, event_type
      ORDER BY total DESC
    `);

    // Zinc order costs vs Stripe revenue
    var orderEconomics = await p.query(`
      SELECT COUNT(*) as total_orders, COALESCE(SUM(zinc_cost), 0) as total_zinc_cost
      FROM orders
    `);

    // Per-call breakdown (most recent 50)
    var perCall = await p.query(`
      SELECT call_id, customer_phone, duration_seconds, minutes_billed,
             vapi_cost, anthropic_cost, sms_cost, search_cost, total_cost, revenue, profit, created_at
      FROM calls
      ORDER BY created_at DESC
      LIMIT 50
    `);

    res.json({
      totals: totals.rows[0],
      byProvider: byProvider.rows,
      orderEconomics: orderEconomics.rows[0],
      perCall: perCall.rows,
    });
  } catch(err) {
    console.error("[ADMIN COSTS]", err.message);
    res.status(503).json({ error: err.message });
  }
});

app.post("/api/admin/add-minutes", async function(req, res) {
  try {
    var newBalance = await db().addBalance(req.body.phone, req.body.minutes);
    res.json({ success: true, new_balance: newBalance });
  } catch(err) { res.status(503).json({ error: err.message }); }
});
