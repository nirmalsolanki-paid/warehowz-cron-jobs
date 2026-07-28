const schedule = require('node-schedule');
const mongoose = require('mongoose');

const jobFactories = [
  require('./queueTimeTracker'),
  require('./projectRenewal'),
  require('./projectExpiry'),
  require('./paymentScheduler'),
  require('./pendingStatusCheck'),
  require('./buyerAccountCheck')
];

// Accepts either a cron string ('0 6 * * *') or a plain object of
// RecurrenceRule fields ({ hour: 5, minute: [1] }).
function buildRule(spec) {
  if (typeof spec === 'string') return spec;
  const rule = new schedule.RecurrenceRule();
  Object.keys(spec).forEach((key) => {
    rule[key] = spec[key];
  });

  return rule;
}

function startJobs(ctx) {
  const Settings = mongoose.model('Settings');

  jobFactories.forEach((createJob) => {
    const job = createJob(ctx);

    const guardedHandler = async () => {
      const setting = await Settings.findOneAndUpdate(
        {},
        { $setOnInsert: { enableCronJobService: false } },
        { upsert: true, new: true }
      );
      if (!setting || !setting.enableCronJobService) {
        console.log(`[CronService] Skipped (disabled): ${job.name}`);

        return;
      }
      await job.run();
    };

    const instance = schedule.scheduleJob(buildRule(job.rule), guardedHandler);
    // node-schedule emits 'error' on a rejected job promise; with no
    // listener, EventEmitter throws that error, turning it into an
    // unhandled rejection that would crash this whole process. Listening
    // here means one job's failure just gets logged instead of killing
    // every other scheduled job.
    instance.on('error', (err) => {
      console.error(`[CronService] Job "${job.name}" failed:`, err);
    });

    console.log(`[CronService] Registered: ${job.name}`);
  });
}

module.exports = { startJobs };
