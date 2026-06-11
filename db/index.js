const { Pool } = require("pg");

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      console.error("[DB] ERROR: DATABASE_URL environment variable is not set!");
      return null;
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    pool.on("error", (err) => console.error("[DB] Pool error:", err.message));
    console.log("[DB] Pool created, connecting to database...");
  }
  return pool;
}

async function initDb() {
  const p = getPool();
  if (!p) {
    console.error("[DB] Cannot init — no DATABASE_URL set");
    return;
  }
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100),
        email VARCHAR(200),
        stripe_customer_id VARCHAR(100),
        balance_minutes INTEGER DEFAULT 0,
        total_calls INTEGER DEFAULT 0,
        total_orders INTEGER DEFAULT 0,
        total_spent DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(50) UNIQUE NOT NULL,
        customer_phone VARCHAR(20) NOT NULL,
        product_title TEXT,
        product_price VARCHAR(20),
        product_url TEXT,
        asin VARCHAR(20),
        store VARCHAR(50) DEFAULT 'Amazon',
        status VARCHAR(30) DEFAULT 'placed',
        tracking_number VARCHAR(100),
        carrier VARCHAR(30),
        stripe_charge_id VARCHAR(100),
        estimated_delivery VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS calls (
        id SERIAL PRIMARY KEY,
        call_id VARCHAR(100),
        customer_phone VARCHAR(20),
        duration_seconds INTEGER DEFAULT 0,
        minutes_billed INTEGER DEFAULT 0,
        outcome VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS minute_purchases (
        id SERIAL PRIMARY KEY,
        customer_phone VARCHAR(20) NOT NULL,
        minutes INTEGER NOT NULL,
        amount_paid DECIMAL(10,2) NOT NULL,
        stripe_payment_id VARCHAR(100),
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log("[DB] All tables ready");
  } catch (err) {
    console.error("[DB] Init failed:", err.message);
  }
}

function normalizePhone(phone) {
  const clean = (phone || "").replace(/\D/g, "");
  return clean.startsWith("1") ? "+" + clean : "+1" + clean;
}

async function getOrCreateCustomer(phone) {
  const p = getPool();
  if (!p) throw new Error("Database not connected — DATABASE_URL missing");
  const normalized = normalizePhone(phone);
  let result = await p.query("SELECT * FROM customers WHERE phone = $1", [normalized]);
  if (result.rows.length === 0) {
    result = await p.query(
      "INSERT INTO customers (phone, balance_minutes, status) VALUES ($1, 0, 'new') RETURNING *",
      [normalized]
    );
    console.log("[DB] New customer:", normalized);
  }
  return result.rows[0];
}

async function updateCustomer(phone, fields) {
  const p = getPool();
  if (!p) throw new Error("Database not connected");
  const normalized = normalizePhone(phone);
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await p.query(
    `UPDATE customers SET ${setClause}, updated_at = NOW() WHERE phone = $1`,
    [normalized, ...values]
  );
}

async function deductBalance(phone, minutes) {
  const p = getPool();
  if (!p) throw new Error("Database not connected");
  const normalized = normalizePhone(phone);
  const result = await p.query(
    `UPDATE customers SET balance_minutes = GREATEST(0, balance_minutes - $2), updated_at = NOW()
     WHERE phone = $1 RETURNING balance_minutes`,
    [normalized, minutes]
  );
  return result.rows[0]?.balance_minutes ?? 0;
}

async function addBalance(phone, minutes) {
  const p = getPool();
  if (!p) throw new Error("Database not connected");
  const normalized = normalizePhone(phone);
  const result = await p.query(
    `UPDATE customers SET balance_minutes = balance_minutes + $2, updated_at = NOW()
     WHERE phone = $1 RETURNING balance_minutes`,
    [normalized, minutes]
  );
  return result.rows[0]?.balance_minutes ?? 0;
}

async function saveOrder(orderData) {
  const p = getPool();
  if (!p) throw new Error("Database not connected");
  const result = await p.query(
    `INSERT INTO orders (order_id, customer_phone, product_title, product_price, product_url, asin, store, status, stripe_charge_id, estimated_delivery)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [orderData.order_id, normalizePhone(orderData.customer_phone), orderData.product_title,
     orderData.product_price, orderData.product_url, orderData.asin,
     orderData.store || "Amazon", orderData.status || "placed",
     orderData.stripe_charge_id, orderData.estimated_delivery]
  );
  return result.rows[0];
}

async function getOrders(phone) {
  const p = getPool();
  if (!p) throw new Error("Database not connected");
  const result = await p.query(
    "SELECT * FROM orders WHERE customer_phone = $1 ORDER BY created_at DESC",
    [normalizePhone(phone)]
  );
  return result.rows;
}

async function saveCall(callData) {
  const p = getPool();
  if (!p) return;
  try {
    await p.query(
      "INSERT INTO calls (call_id, customer_phone, duration_seconds, minutes_billed, outcome) VALUES ($1,$2,$3,$4,$5)",
      [callData.call_id, callData.customer_phone, callData.duration_seconds, callData.minutes_billed, callData.outcome]
    );
  } catch (e) { console.error("[DB] saveCall error:", e.message); }
}

async function getAllCustomers() {
  const p = getPool();
  if (!p) throw new Error("Database not connected");
  const result = await p.query("SELECT * FROM customers ORDER BY created_at DESC");
  return result.rows;
}

async function savePurchase(phone, minutes, amount, stripePaymentId) {
  const p = getPool();
  if (!p) throw new Error("Database not connected");
  const normalized = normalizePhone(phone);
  await p.query(
    "INSERT INTO minute_purchases (customer_phone, minutes, amount_paid, stripe_payment_id) VALUES ($1,$2,$3,$4)",
    [normalized, minutes, amount, stripePaymentId]
  );
  return await addBalance(normalized, minutes);
}

module.exports = {
  getPool, initDb,
  getOrCreateCustomer, updateCustomer,
  deductBalance, addBalance,
  saveOrder, getOrders,
  saveCall, getAllCustomers, savePurchase,
};
