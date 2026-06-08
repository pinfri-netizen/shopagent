# ─────────────────────────────────────────────
#  ShopAgent Server — Environment Variables
#  Copy this file to .env and fill in your keys
# ─────────────────────────────────────────────

# Anthropic (for product search via Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Twilio (for SMS product photos + confirmations)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+18455550101   # your MMS-capable Twilio number

# Stripe (for charging customer cards)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# EasyPost (for package tracking)
EASYPOST_API_KEY=EZAK...

# App settings
PORT=3000
DEFAULT_MINUTES=30    # default prepaid minutes for new customers
