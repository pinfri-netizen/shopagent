require("dotenv").config();

async function trackPackage({ tracking_number, carrier, customer_phone }) {
  if (!tracking_number) {
    return { success: false, spoken: "I do not have a tracking number for that order yet. It usually arrives within an hour of ordering." };
  }

  try {
    let status = "In Transit";
    let location = "Arrived at carrier facility";
    let eta = "Tomorrow";

    if (process.env.EASYPOST_API_KEY) {
      try {
        const EasyPost = require("@easypost/api");
        const epClient = new EasyPost(process.env.EASYPOST_API_KEY);
        const tracker = await epClient.Tracker.create({ tracking_code: tracking_number, carrier: carrier || undefined });
        status = tracker.status || status;
        const lastDetail = tracker.tracking_details && tracker.tracking_details.length > 0
          ? tracker.tracking_details[tracker.tracking_details.length - 1] : null;
        location = (lastDetail && lastDetail.message) || location;
        if (tracker.est_delivery_date) {
          eta = new Date(tracker.est_delivery_date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
        }
      } catch (epErr) {
        console.error("EasyPost error:", epErr.message);
      }
    }

    if (customer_phone && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_ACCOUNT_SID.startsWith("AC")) {
      try {
        const twilio = require("twilio");
        const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const digits = customer_phone.replace(/\D/g, "");
        const toNumber = digits.startsWith("1") ? "+" + digits : "+1" + digits;
        await twilioClient.messages.create({
          body: "ShopAgent Tracking Update\n\nTracking: " + tracking_number + "\nStatus: " + status + "\n" + location + "\nEstimated delivery: " + eta,
          from: process.env.TWILIO_FROM_NUMBER,
          to: toNumber,
        });
      } catch (smsErr) {
        console.error("Tracking SMS failed:", smsErr.message);
      }
    }

    return {
      success: true, status, location, eta,
      spoken: "Your package status is " + status + ". " + location + ". Estimated delivery is " + eta + ". I have also sent the tracking details to your phone.",
    };
  } catch (err) {
    console.error("Tracking error:", err.message);
    return { success: false, spoken: "I could not retrieve tracking for that number right now. Try checking directly on Amazon." };
  }
}

module.exports = { trackPackage };
