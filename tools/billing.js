require("dotenv").config();

async function getBalance({ phone_number }) {
  // Clean the phone number — VAPI passes it in various formats
  const raw = (phone_number || "").replace(/[^0-9]/g, "");
  if (!raw || raw.length < 7) {
    return {
      success: false,
      balance: 0,
      is_new: true,
      spoken: "I could not find an account for that number. Could you confirm your phone number for me?"
    };
  }

  const normalized = raw.startsWith("1") ? "+" + raw : "+1" + raw;
  console.log("[BALANCE] Looking up:", normalized);

  try {
    const db = require("../db");
    const customer = await db.getOrCreateCustomer(normalized);
    const mins = customer.balance_minutes || 0;
    const isNew = customer.status === "new" && mins === 0;
    const name = customer.name ? customer.name.split(" ")[0] : null;

    let spoken;
    if (isNew) {
      spoken = `Hi there! I don't see an active account for your number yet. To start shopping you will need to add minutes at shopagent-production-fee3.up.railway.app. Would you like me to help you with anything else?`;
    } else if (mins <= 0) {
      spoken = `Hi ${name || "there"}! Your minute balance is empty. Please top up at shopagent-production-fee3.up.railway.app to continue shopping.`;
    } else if (mins <= 5) {
      spoken = `Hi ${name || "there"}! You have ${mins} minute${mins === 1 ? "" : "s"} remaining — I will be quick! What would you like to shop for today?`;
    } else {
      spoken = `Hi ${name || "there"}! You have ${mins} minutes remaining. What would you like to shop for today?`;
    }

    return {
      success: true,
      balance: mins,
      customer_name: customer.name,
      customer_phone: normalized,
      is_new: isNew,
      spoken
    };
  } catch (err) {
    console.error("[BALANCE] Error:", err.message);
    // Don't block the call if DB fails — allow 30 free minutes
    return {
      success: true,
      balance: 30,
      is_new: false,
      spoken: "Welcome to ShopAgent! What would you like to shop for today?"
    };
  }
}

async function deductMinutes({ phone_number, minutes }) {
  const raw = (phone_number || "").replace(/[^0-9]/g, "");
  const normalized = raw.startsWith("1") ? "+" + raw : "+1" + raw;
  const toDeduct = Math.max(1, Math.ceil(minutes || 1));

  try {
    const db = require("../db");
    const remaining = await db.deductBalance(normalized, toDeduct);

    let spoken;
    if (remaining <= 0) {
      spoken = "Your minutes have run out. Thank you for using ShopAgent! Top up at shopagent-production-fee3.up.railway.app to continue.";
    } else if (remaining <= 3) {
      spoken = `Just a heads up — you only have ${remaining} minutes left.`;
    } else {
      spoken = `${toDeduct} minute${toDeduct === 1 ? "" : "s"} used. You have ${remaining} remaining.`;
    }

    return { success: true, remaining, deducted: toDeduct, spoken };
  } catch (err) {
    console.error("[BALANCE] Deduct error:", err.message);
    return { success: true, remaining: 0, deducted: toDeduct, spoken: "Minutes updated." };
  }
}

module.exports = { getBalance, deductMinutes };
