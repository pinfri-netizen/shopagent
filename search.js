// ═══════════════════════════════════════════════════
//  billing.js — Prepaid minute balance management
//  In production: connect to your DB (Postgres/Redis)
// ═══════════════════════════════════════════════════

// In-memory store for demo — replace with real DB
const balances = {};

function getDefaultBalance() {
  return parseInt(process.env.DEFAULT_MINUTES || "30");
}

async function getBalance({ phone_number }) {
  const key = phone_number?.replace(/\D/g, "") || "demo";
  if (balances[key] === undefined) {
    balances[key] = getDefaultBalance();
  }
  const mins = balances[key];

  let spoken;
  if (mins <= 0) {
    spoken = "You have no minutes remaining. To continue shopping, you'll need to top up your account. You can do that at shopagent.com or call back after topping up online.";
  } else if (mins <= 5) {
    spoken = `You have ${mins} minute${mins === 1 ? "" : "s"} remaining. That's getting low — I'll try to wrap up quickly for you.`;
  } else {
    spoken = `You have ${mins} minutes remaining on your account.`;
  }

  return { success: true, balance: mins, spoken };
}

async function deductMinutes({ phone_number, minutes }) {
  const key = phone_number?.replace(/\D/g, "") || "demo";
  if (balances[key] === undefined) {
    balances[key] = getDefaultBalance();
  }

  const toDeduct = Math.max(1, Math.ceil(minutes || 1));
  balances[key] = Math.max(0, balances[key] - toDeduct);
  const remaining = balances[key];

  let spoken = `${toDeduct} minute${toDeduct === 1 ? "" : "s"} used. You have ${remaining} left.`;
  if (remaining <= 0) {
    spoken = "Your minutes have run out. Thank you for using ShopAgent! Top up at shopagent.com to continue shopping.";
  } else if (remaining <= 3) {
    spoken = `Just a heads up — you only have ${remaining} minutes remaining.`;
  }

  return { success: true, remaining, deducted: toDeduct, spoken };
}

module.exports = { getBalance, deductMinutes };
