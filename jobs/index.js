const mongoose = require('mongoose');

// Each job is now triggered by an HTTP request (see routes/jobs.js) instead
// of firing on its own in-process node-schedule timer — Cloud Scheduler owns
// timing and hits POST /jobs/:slug on the cron schedule configured there.
const jobFactories = [
  { slug: 'queue-time-tracker', factory: require('./queueTimeTracker') },
  { slug: 'project-renewal', factory: require('./projectRenewal') },
  { slug: 'project-expiry', factory: require('./projectExpiry') },
  { slug: 'payment-scheduler', factory: require('./paymentScheduler') },
  { slug: 'pending-status-check', factory: require('./pendingStatusCheck') },
  { slug: 'buyer-account-check', factory: require('./buyerAccountCheck') }
];

// Builds a Map<slug, { name, run }> — same Settings.enableCronJobService
// on/off switch the old node-schedule guard used, just checked per-request
// instead of per-tick.
function createJobRegistry(ctx) {
  const Settings = mongoose.model('Settings');
  const jobs = new Map();

  jobFactories.forEach(({ slug, factory }) => {
    const job = factory(ctx);

    jobs.set(slug, {
      name: job.name,
      run: async () => {
        const setting = await Settings.findOneAndUpdate(
          {},
          { $setOnInsert: { enableCronJobService: false } },
          { upsert: true, new: true }
        );
        if (!setting || !setting.enableCronJobService) {
          console.log(`[CronService] Skipped (disabled): ${job.name}`);

          return { skipped: true };
        }
        await job.run();

        return { skipped: false };
      }
    });
  });

  return jobs;
}

module.exports = { createJobRegistry };
