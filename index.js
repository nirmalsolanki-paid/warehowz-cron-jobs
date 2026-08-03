const { getEnvFromSecretManager } = require('./config/secret-manager');
const config = require('./config');

// Cloud Run Job entry point — this process runs ONE job, then exits. Which
// job is picked via the JOB_SLUG env var set on that particular Cloud Run
// Job resource (see README: one Cloud Run Job per cron job, each pointing
// at the same image with a different JOB_SLUG). There is no HTTP server —
// Cloud Scheduler triggers execution via the Cloud Run Admin API, not by
// hitting a URL this container serves.
async function run() {
  const slug = process.env.JOB_SLUG;
  if (!slug) {
    throw new Error(
      'JOB_SLUG env var is required — set it on the Cloud Run Job so this execution knows which cron job to run.'
    );
  }

  const secrets = await getEnvFromSecretManager();
  config.init(secrets);
  console.log(`✅ Cron job runner initialized secrets for ${config.NODE_ENV}`);

  if (!config.db) {
    throw new Error('MONGODB_CONNECTION_STRING missing from secret payload');
  }

  const mongoose = require('mongoose');

  await mongoose.connect(config.db, {
    keepAlive: true,
    useNewUrlParser: true,
    useFindAndModify: true,
    useUnifiedTopology: true,
    poolSize: 10,
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000
  });
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
  const { createJobRegistry } = require('./jobs');

  const jobs = createJobRegistry({ config, sender, emailsConfig, stripe });
  const job = jobs.get(slug);
  if (!job) {
    throw new Error(
      `Unknown JOB_SLUG "${slug}" — must be one of: ${Array.from(jobs.keys()).join(', ')}`
    );
  }

  console.log(`🚀 Running job: ${job.name}`);
  const result = await job.run();
  console.log(`✅ Job finished: ${job.name}`, result);

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Cron job failed:', err);
    process.exit(1);
  });

process.on('uncaughtException', (err) => {
  console.error('[CronJob] uncaughtException:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('[CronJob] unhandledRejection:', err);
  process.exit(1);
});
