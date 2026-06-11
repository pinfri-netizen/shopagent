# ShopAgent Backend Server

VAPI backend for AI phone shopping agent. Handles product search, SMS photos, orders, tracking, and minute billing.

## Quick Deploy to Railway

1. Upload this whole folder to a GitHub repo
2. Go to railway.app and click New Project from GitHub
3. Select your repo and Railway will auto-detect Node.js
4. Add these environment variables in Railway Settings:

   ANTHROPIC_API_KEY
   TWILIO_ACCOUNT_SID
   TWILIO_AUTH_TOKEN
   TWILIO_FROM_NUMBER
   STRIPE_SECRET_KEY
   EASYPOST_API_KEY
   DEFAULT_MINUTES=30

5. Railway gives you a public URL like https://shopagent-server-production.up.railway.app
6. Open that URL in your browser and you should see: {"status":"ShopAgent server running"}

## Update VAPI

Replace YOUR_RAILWAY_URL in vapi-assistant-config.json with your Railway URL and paste the config into your VAPI assistant Advanced tab.

## Files

- server.js              Main Express server
- tools/search.js        Amazon product search
- tools/sms.js           Send MMS photos via Twilio
- tools/order.js         Place order and charge card
- tools/tracking.js      Track packages via EasyPost
- tools/billing.js       Prepaid minute balance
- vapi-assistant-config.json  Paste into VAPI dashboard
- .env.example           Copy to .env with your keys
