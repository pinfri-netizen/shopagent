// ═══════════════════════════════════════════════════
//  tracking.js — Package tracking via EasyPost
// ═══════════════════════════════════════════════════

const EasyPost = require("@easypost/api");

async function trackPackage({ tracking_number, carrier, customer_phone }) {
  if (!tracking_number) {
    return { success: false, spoken: "I don't have a tracking number for that order yet. It usually arrives within an hour of ordering." };
  }

  try {
    if (process.env.EASYPOST_API_KEY) {
      const client = new EasyPost(process.env.EASYPOST_API_KEY);
      const tracker = await client.Tracker.create({ tracking_code: tracking_number, carrier });

      const status = tracker.status;
      const location = tracker.tracking_details?.[tracker.tracking_details.length - 1]?.message || "In transit";
      const eta = tracker.est_delivery_date
        ? new Date(tracker.est_delivery_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
        : "soon";

      // SMS the tracking update
      if (customer_phone && process.env.TWILIO_FROM_NUMBER) {
        const twilio = require("twilio");
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const formattedPhone = customer_phone.replace(/\D/g, "");
        const toNumber = formattedPhone.startsWith("1") ? `+${formattedPhone}` : `+1${formattedPhone}`;
        await twilioClient.messages.create({
          body: `📦 ShopAgent Tracking Update\n\nTracking: ${tracking_number}\nStatus: ${status}\n${location}\nETA: ${eta}`,
          from: process.env.TWILIO_FROM_NUMBER,
          to: toNumber,
        });
      }

      return {
        success: true,
        status,
        location,
        eta,
        spoken: `Your package status is ${status}. ${location}. Estimated delivery is ${eta}. I've also sent the tracking details to your phone.`,
      };
    } else {
      // Demo mode
      return {
        success: true,
        status: "In Transit",
        location: "Arrived at carrier facility",
        eta: "Tomorrow",
        spoken: `Your package is in transit and on its way! Expected delivery is tomorrow. I've sent the tracking link to your phone.`,
      };
    }
  } catch (err) {
    console.error("Tracking error:", err.message);
    return {
      success: false,
      spoken: `I couldn't retrieve tracking for ${tracking_number} right now. Try checking directly on Amazon or I can text you the tracking link.`,
    };
  }
}

module.exports = { trackPackage };
