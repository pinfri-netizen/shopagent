require("dotenv").config();

const balances = {};

function getDefault() {
  return parseInt(process.env.DEFAULT_MINUTES || "30");
}

async function getBalance({ phone_number }) {
  const key = (phone_number || "demo").replace(/\D/g, "");
  if (balances[key] === undefined) balances[key] = getDefault();
  const mins = balances[key];

  let spoken;
  if (mins <= 0) {
    spoken = "You have no minutes remaining. To continue shopping please top up your account at shopagent.com.";
  } else if (mins <= 5) {
    spoken = "You have " + mins + " minute" + (mins === 1 ? "" : "s") + " remaining. That is getting low so I will be quick.";
  } else {
    spoken = "You have " + mins + " minutes remaining on your account.";
  }

  return { success: true, balance: mins, spoken };
}

async function deductMinutes({ phone_number, minutes }) {
  const key = (phone_number || "demo").replace(/\D/g, "");
  if (balances[key] === undefined) balances[key] = getDefault();
  const toDeduct = Math.max(1, Math.ceil(minutes || 1));
  balances[key] = Math.max(0, balances[key] - toDeduct);
  const remaining = balances[key];

  let spoken;
  if (remaining <= 0) {
    spoken = "Your minutes have run out. Thank you for using ShopAgent! Top up at shopagent.com to continue.";
  } else if (remaining <= 3) {
    spoken = "Just a heads up, you only have " + remaining + " minutes remaining.";
  } else {
    spoken = toDeduct + " minute" + (toDeduct === 1 ? "" : "s") + " used. You have " + remaining + " left.";
  }

  return { success: true, remaining, deducted: toDeduct, spoken };
}

module.exports = { getBalance, deductMinutes };
