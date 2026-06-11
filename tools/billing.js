require("dotenv").config();

async function getBalance({ phone_number }) {
  try {
    const db = require("../db");
    const customer = await db.getOrCreateCustomer(phone_number);
    const mins = customer.balance_minutes;
    const isNew = customer.status === "new";

    let spoken;
    if (isNew) {
      spoken = "Welcome to ShopAgent! I have created your account. You currently have no minutes. To start shopping, you will need to add minutes at shopagent-production-fee3.up.railway.app. Is there anything else I can help you with?";
    } else if (mins <= 0) {
      spoken = "Hi " + (customer.name || "there") + "! Your minute balance is empty. Please top up at shopagent-production-fee3.up.railway.app to continue shopping.";
    } else if (mins <= 5) {
      spoken = "Hi " + (customer.name || "there") + "! Just a heads up — you only have " + mins + " minutes remaining. I will be quick! What would you like to shop for?";
    } else {
      spoken = "Hi " + (customer.name || "there") + "! You have " + mins + " minutes remaining. What would you like to shop for today?";
    }

    return { success: true, balance: mins, customer_name: customer.name, is_new: isNew, spoken };
  } catch (err) {
    console.error("getBalance error:", err.message);
    return { success: true, balance: 30, spoken: "Welcome to ShopAgent! What would you like to shop for today?" };
  }
}

async function deductMinutes({ phone_number, minutes }) {
  try {
    const db = require("../db");
    const toDeduct = Math.max(1, Math.ceil(minutes || 1));
    const remaining = await db.deductBalance(phone_number, toDeduct);

    let spoken;
    if (remaining <= 0) {
      spoken = "Your minutes have run out. Thank you for using ShopAgent! Top up at shopagent-production-fee3.up.railway.app to continue.";
    } else if (remaining <= 3) {
      spoken = "Just a heads up — you only have " + remaining + " minutes left.";
    } else {
      spoken = toDeduct + " minute" + (toDeduct === 1 ? "" : "s") + " used. You have " + remaining + " remaining.";
    }

    return { success: true, remaining, deducted: toDeduct, spoken };
  } catch (err) {
    console.error("deductMinutes error:", err.message);
    return { success: true, remaining: 0, deducted: minutes, spoken: "Minutes updated." };
  }
}

module.exports = { getBalance, deductMinutes };
