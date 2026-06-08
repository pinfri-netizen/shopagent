{
  "name": "shopagent-server",
  "version": "1.0.0",
  "description": "ShopAgent VAPI backend server — handles tool calls for search, SMS, orders, tracking",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@easypost/api": "^8.0.0",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "stripe": "^14.0.0",
    "twilio": "^4.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.0"
  }
}
