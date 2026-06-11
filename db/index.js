const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("railway")
    ? { rejectUnauthorized: false }
    : false,
});

// Run on startup — create tables if they don't exist
async function initDb() {
  const fs = require("fs");
  const path = require("path");
  try {
    const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
    await pool.query(schema);
    console.log("[DB] Tables ready");
  } catch (err) {
    console.error("[DB] Init error:", err.message);
  }
}

// Get or create customer by phone number
async function getOrCreateCustomer(phone) {
  const clean = phone.replace(/\D/g, "");
  const normalized = clean.startsWith("1") ? "+" + clean : "+1" + clean;
  
  let result = await pool.query(
    "SELECT * FROM customers WHERE phone = $1", [normalized]
  );
  
  if (result.rows.length === 0) {
    result = await pool.query(
      `INSERT INTO customers (phone, balance_minutes, status)
       VALUES ($1, 0, 'new') RETURNING *`,
      [normalized]
    );
    console.log("[DB] New customer created:", normalized);
  }
  
  return result.rows[0];
}

async function updateCustomer(phone, fields) {
  const clean = phone.replace(/\D/g, "");
  const normalized = clean.startsWith("1") ? "+" + clean : "+1" + clean;
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(", ");
  await pool.query(
    `UPDATE customers SET ${setClause}, updated_at = NOW() WHERE phone = $1`,
    [normalized, ...values]
  );
}

async function deductBalance(phone, minutes) {
  const clean = phone.replace(/\D/g, "");
  const normalized = clean.startsWith("1") ? "+" + clean : "+1" + clean;
  const result = await pool.query(
    `UPDATE customers 
     SET balance_minutes = GREATEST(0, balance_minutes - $2), updated_at = NOW()
     WHERE phone = $1 
     RETURNING balance_minutes`,
    [normalized, minutes]
  );
  return result.rows[0]?.balance_minutes ?? 0;
}

async function addBalance(phone, minutes) {
  const clean = phone.replace(/\D/g, "");
  const normalized = clean.startsWith("1") ? "+" + clean : "+1" + clean;
  const result = await pool.query(
    `UPDATE customers 
     SET balance_minutes = balance_minutes + $2, updated_at = NOW()
     WHERE phone = $1 
     RETURNING balance_minutes`,
    [normalized, minutes]
  );
  return result.rows[0]?.balance_minutes ?? 0;
}

async function saveOrder(orderData) {
  const result = await pool.query(
    `INSERT INTO orders 
     (order_id, customer_phone, product_title, product_price, product_url, asin, store, status, stripe_charge_id, estimated_delivery)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [
      orderData.order_id, orderData.customer_phone, orderData.product_title,
      orderData.product_price, orderData.product_url, orderData.asin,
      orderData.store || "Amazon", orderData.status || "placed",
      orderData.stripe_charge_id, orderData.estimated_delivery,
    ]
  );
  return result.rows[0];
}

async function getOrders(phone) {
  const clean = phone.replace(/\D/g, "");
  const normalized = clean.startsWith("1") ? "+" + clean : "+1" + clean;
  const result = await pool.query(
    "SELECT * FROM orders WHERE customer_phone = $1 ORDER BY created_at DESC",
    [normalized]
  );
  return result.rows;
}

async function saveCall(callData) {
  await pool.query(
    `INSERT INTO calls (call_id, customer_phone, duration_seconds, minutes_billed, outcome)
     VALUES ($1,$2,$3,$4,$5)`,
    [callData.call_id, callData.customer_phone, callData.duration_seconds,
     callData.minutes_billed, callData.outcome]
  );
}

async function getAllCustomers() {
  const result = await pool.query(
    "SELECT * FROM customers ORDER BY created_at DESC"
  );
  return result.rows;
}

async function savePurchase(phone, minutes, amount, stripePaymentId) {
  const clean = phone.replace(/\D/g, "");
  const normalized = clean.startsWith("1") ? "+" + clean : "+1" + clean;
  await pool.query(
    `INSERT INTO minute_purchases (customer_phone, minutes, amount_paid, stripe_payment_id)
     VALUES ($1,$2,$3,$4)`,
    [normalized, minutes, amount, stripePaymentId]
  );
  return await addBalance(normalized, minutes);
}

module.exports = {
  pool, initDb,
  getOrCreateCustomer, updateCustomer,
  deductBalance, addBalance,
  saveOrder, getOrders,
  saveCall, getAllCustomers, savePurchase,
};
