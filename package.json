# ShopAgent Backend Server

VAPI backend that handles: product search, SMS photos, order placement, package tracking, and minute billing.

---

## DEPLOY IN 15 MINUTES (Railway — free)

### Step 1 — Upload to GitHub

1. Create a new GitHub repo (github.com → New repository → name it `shopagent-server`)
2. Upload all these files to it (drag and drop in the GitHub UI)

### Step 2 — Deploy on Railway

1. Go to **railway.app** and sign up free
2. Click **New Project → Deploy from GitHub repo**
3. Select your `shopagent-server` repo
4. Railway auto-detects Node.js and deploys it
5. Click **Variables** tab and add these environment variables:

```
ANTHROPIC_API_KEY       = sk-ant-...        (from console.anthropic.com)
TWILIO_ACCOUNT_SID      = ACxxx...          (from twilio.com/console)
TWILIO_AUTH_TOKEN       = xxx...            (from twilio.com/console)
TWILIO_FROM_NUMBER      = +18456170148      (your MMS Twilio number)
STRIPE_SECRET_KEY       = sk_live_...       (from dashboard.stripe.com)
EASYPOST_API_KEY        = EZAK...           (from easypost.com — free tier works)
```

6. Railway gives you a public URL like: `https://shopagent-server-production.up.railway.app`
7. Test it: open that URL in browser — you should see `{"status":"ShopAgent server running"}`

---

### Step 3 — Update VAPI assistant config

1. Open `vapi-assistant-config.json`
2. Replace every `YOUR_RAILWAY_URL` with your actual Railway URL
3. Go to **vapi.ai/dashboard → Assistants → ShopAgent**
4. Click the **{} JSON** or **Advanced** tab
5. Paste the entire contents of `vapi-assistant-config.json`
6. Save

---

### Step 4 — Assign the number

1. VAPI Dashboard → **Phone Numbers** → click `+1 (845) 617-0148`
2. Set **Inbound assistant** → `ShopAgent`
3. Set **Server URL** → `https://YOUR_RAILWAY_URL.up.railway.app/vapi/webhook`
4. Save

---

### Step 5 — Test the full flow

Call **+1 (845) 617-0148** and say:

> *"I need a trampoline"*

The agent will:
1. ✅ Check your minute balance
2. ✅ Ask who it's for + yard size
3. ✅ Ask sort preference
4. ✅ Search Amazon live
5. ✅ Text you 3 product photos via MMS
6. ✅ Ask which you want
7. ✅ Confirm price + card
8. ✅ Place the order
9. ✅ SMS you confirmation + tracking

---

## API KEYS — WHERE TO GET THEM

| Key | Where to get it | Free tier? |
|-----|----------------|------------|
| ANTHROPIC_API_KEY | console.anthropic.com | Pay per use (cheap) |
| TWILIO_ACCOUNT_SID + AUTH_TOKEN | twilio.com/console | $15 trial credit |
| TWILIO_FROM_NUMBER | Buy MMS number in Twilio ($1/mo) | $1/month |
| STRIPE_SECRET_KEY | dashboard.stripe.com | Free, 2.9% per charge |
| EASYPOST_API_KEY | easypost.com | Free for tracking |

---

## FILE STRUCTURE

```
shopagent-server/
├── server.js                  ← Main Express app, routes all VAPI tool calls
├── tools/
│   ├── search.js              ← Amazon product search via Claude + web search
│   ├── sms.js                 ← Send MMS product photos via Twilio
│   ├── order.js               ← Place order + charge Stripe card
│   ├── tracking.js            ← Track packages via EasyPost
│   └── billing.js             ← Prepaid minute balance management
├── vapi-assistant-config.json ← Paste this into VAPI dashboard
├── .env.example               ← Copy to .env and fill in your keys
├── package.json               ← Node dependencies
└── README.md                  ← This file
```

---

## HOW VAPI TOOL CALLS WORK

When the AI decides to search for a product mid-call, VAPI sends a POST to your server:

```json
POST /vapi/tools
{
  "message": {
    "type": "tool-calls",
    "toolCallList": [
      {
        "id": "call_abc123",
        "function": {
          "name": "search_products",
          "arguments": "{\"query\":\"14ft trampoline kids outdoor\",\"sort\":\"best_value\"}"
        }
      }
    ]
  }
}
```

Your server runs the tool and responds:

```json
{
  "results": [
    {
      "toolCallId": "call_abc123",
      "result": "{\"success\":true,\"spoken\":\"I found 3 great options...\",\"products\":[...]}"
    }
  ]
}
```

VAPI reads the `spoken` field back to the customer and the call continues.

---

## NEXT STEPS AFTER MVP

1. **Add a real database** (PostgreSQL on Railway) to store customer profiles, orders, balances
2. **Real Amazon ordering** — Amazon Buy with Prime API or Playwright browser automation
3. **Stripe customer vault** — store cards so customers don't have to re-enter
4. **Customer portal** — web dashboard to manage account, see orders, buy minutes
5. **SMS opt-in flow** — text customers to save their card before their first call
