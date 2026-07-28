const http = require('http');
const { getEnvFromSecretManager } = require('./config/secret-manager');
const config = require('./config');

// Cloud Run requires the container to bind $PORT and answer health checks;
// this service is otherwise a pure background worker with no inbound traffic.
function startHealthServer() {
  const port = process.env.PORT || 8080;
  http
    .createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    })
    .listen(port, () => {
      console.log(`✅ Health check server listening on port ${port}`);
    });
}

async function main() {
  startHealthServer();

  const secrets = await getEnvFromSecretManager();
  config.init(secrets);
  console.log(`✅ Cron service initialized secrets for ${config.NODE_ENV}`);

  if (!config.db) {
    console.error('❌ MONGODB_CONNECTION_STRING missing from secret payload');
    process.exit(1);
  }

  const mongoose = require('mongoose');

  const mongooseOptions = {
    keepAlive: true,
    useNewUrlParser: true,
    useFindAndModify: true,
    useUnifiedTopology: true,
    poolSize: 10,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000
  };

  mongoose.connect(config.db, mongooseOptions);

  const db = mongoose.connection;

  let hasConnectedOnce = false;
  let startupConnectTimer = null;
  const STARTUP_CONNECT_TIMEOUT_MS = 45000;

  db.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
    if (!hasConnectedOnce) {
      // The driver (useUnifiedTopology) retries connecting in the background
      // on its own; a single error here can be a transient blip, so give it
      // a grace window before treating startup as failed.
      if (!startupConnectTimer) {
        startupConnectTimer = setTimeout(() => {
          console.error(
            `Unable to connect to database after ${STARTUP_CONNECT_TIMEOUT_MS}ms of retries`
          );
          process.exit(1);
        }, STARTUP_CONNECT_TIMEOUT_MS);
      }
    }
  });

  db.on('connected', () => {
    hasConnectedOnce = true;
    if (startupConnectTimer) {
      clearTimeout(startupConnectTimer);
      startupConnectTimer = null;
    }
    console.log('✅ Database connection successful');

    // Register all models before any job requires mongoose.model('X').
    require('glob')
      .sync(__dirname + '/models/*.js')
      .forEach((model) => require(model));

    // Required only after config.init() has populated config, and after
    // config.NODE_ENV is set — config/emails.js reads it at require-time.
    const emailsConfig = require('./config/emails');
    const sender = require('./lib/notification')();
    const stripe = require('stripe')(config.stripe.secret_key);
    const { startJobs } = require('./jobs');

    startJobs({ config, sender, emailsConfig, stripe });
    console.log('🚀 Cron service running');
  });
}

main().catch((err) => {
  console.error('❌ Failed to load secrets or start cron service:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('[CronService] uncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
  console.error('[CronService] unhandledRejection:', err);
});
