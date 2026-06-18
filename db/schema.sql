-- ShopAgent Database Schema

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
  product_cost DECIMAL(10,2) DEFAULT 0,
  product_url TEXT,
  asin VARCHAR(20),
  store VARCHAR(50) DEFAULT 'Amazon',
  status VARCHAR(30) DEFAULT 'placed',
  tracking_number VARCHAR(100),
  carrier VARCHAR(30),
  stripe_charge_id VARCHAR(100),
  zinc_cost DECIMAL(10,2) DEFAULT 0,
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
  transcript TEXT,
  vapi_cost DECIMAL(10,4) DEFAULT 0,
  anthropic_cost DECIMAL(10,4) DEFAULT 0,
  sms_cost DECIMAL(10,4) DEFAULT 0,
  search_cost DECIMAL(10,4) DEFAULT 0,
  total_cost DECIMAL(10,4) DEFAULT 0,
  revenue DECIMAL(10,4) DEFAULT 0,
  profit DECIMAL(10,4) DEFAULT 0,
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

-- Tracks every cost-incurring event for granular reporting
CREATE TABLE IF NOT EXISTS cost_events (
  id SERIAL PRIMARY KEY,
  call_id VARCHAR(100),
  customer_phone VARCHAR(20),
  event_type VARCHAR(50),
  provider VARCHAR(30),
  cost DECIMAL(10,4) DEFAULT 0,
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_phone);
CREATE INDEX IF NOT EXISTS idx_calls_customer ON calls(customer_phone);
CREATE INDEX IF NOT EXISTS idx_cost_events_call ON cost_events(call_id);
