// Mirrors the main app's config/config.js pattern: a mutable object that
// stays empty until init(secrets) populates it, so any file that
// `require('../config')` gets the same reference and sees real values as
// long as init() ran first (see index.js — secrets are loaded and init()
// is called before anything else is required).
const config = {};

function init(secrets) {
  // This service only ever reads the dedicated `ENV_PROD` secret (see
  // config/secret-manager.js) — it has no staging variant, so the
  // environment is always production, not inferred from the payload.
  Object.assign(config, {
    NODE_ENV: 'production',
    test: false,
    db: secrets.MONGODB_CONNECTION_STRING,
    url: secrets.APP_URL,
    stripe: {
      secret_key: secrets.STRIPE_SECRET_KEY
    },
    email: {
      sendgrid_api_key: secrets.SEND_GRID_API_KEY,
      sender: secrets.SENDER_EMAIL
    },
    impersonationKey: secrets.IMPERSONATION_KEY
  });

  return config;
}

module.exports = config;
module.exports.init = init;
