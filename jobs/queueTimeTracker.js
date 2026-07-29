const mongoose = require('mongoose');
const moment = require('moment');
const axios = require('axios');
const timeConverter = require('../lib/timeConverter');

const padLeft = (nr, n, str) =>
  Array(n - String(nr).length + 1).join(str || '0') + nr;

const CHUNK_SIZE = 25;

async function processInChunks(items, chunkSize, handler) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(chunk.map(handler));
  }
}

module.exports = (ctx) => {
  const { config, sender, emailsConfig } = ctx;
  const Project = mongoose.model('Project');
  const Tickets = mongoose.model('Ticket');
  const Invoice = mongoose.model('Invoice');
  const Quotes = mongoose.model('Quotes');

  const workingDays = [1, 2, 3, 4, 5];
  const workingHours = [9, 10, 11, 12, 13, 14, 15, 16];

  // Guard: skip tick if previous run is still in progress
  let isRunning = false;

  // ─────────────────────────────────────────────
  //  MAIN ORCHESTRATOR
  // ─────────────────────────────────────────────
  async function runScheduledTasks() {
    // Compute EST/IST time once
    const now = new Date();
    let currentDay, currentHour, currentMinute;

    if (config.test) {
      const IST = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
      currentDay = IST.getDay();
      currentHour = IST.getHours();
      currentMinute = IST.getMinutes();
    } else {
      const EST = new Date(now.getTime() - 4 * 60 * 60 * 1000);
      currentDay = EST.getDay();
      currentHour = EST.getHours();
      currentMinute = EST.getMinutes();
    }

    console.log(currentDay, currentHour, currentMinute, 'Every Minute');

    const withinWorkingHours =
      workingDays.includes(currentDay) && workingHours.includes(currentHour);

    const BASE_DATE_PROJECT = new Date('2021-09-10');
    const BASE_DATE_ACTIVE = new Date('2021-09-24');

    // ── Fire ALL independent DB queries in parallel ──
    const [
      allInvoices,
      allQuoteDelivered,
      allWarehouseSelected,
      allProjectsActive,
      inQueueProjects,
      projectsToShowQuotes
    ] = await Promise.all([
      // 1. Invoices needing ticket creation (always runs)
      Invoice.find({
        createdAt: { $gte: BASE_DATE_PROJECT },
        $or: [
          {
            status: 'Payment Disputed',
            ticketGeneratedAutomaticallyForDispute: false
          },
          {
            status: 'Payment Failed',
            ticketGeneratedAutomaticallyForFailed: false
          }
        ]
      })
        .populate('findSpaceUserId project')
        .exec(),

      // 2. Quote Delivered projects for 72h email (always runs)
      Project.find({
        projectStage: 'Quote Delivered',
        createdAt: { $gte: BASE_DATE_PROJECT }
      })
        .populate('findSpaceUserId')
        .exec(),

      // 3. Warehouse Selected projects for contract email (always runs)
      Project.find({
        projectStage: 'Warehouse Selected',
        createdAt: { $gte: BASE_DATE_PROJECT },
        warehouseSelected: true,
        warehouseSelectedSince: { $gt: 0 }
      })
        .populate({
          path: 'quote_accepted',
          populate: [{ path: 'listSpaceUserId', model: 'ListSpaceUser' }]
        })
        .populate('findSpaceUserId')
        .exec(),

      // 4. Active projects for invoice notification (always runs)
      Project.find({
        status: 'Active',
        createdAt: { $gte: BASE_DATE_ACTIVE },
        howzerToBeNotifiedAboutInvoiceEmail: { $ne: true }
      })
        .populate('listSpaceUserId')
        .exec(),

      // 5 & 6. Queue / quote-timing tasks (working hours only — resolve empty outside hours)
      withinWorkingHours
        ? Project.find({ inQueue: true }).exec()
        : Promise.resolve([]),

      withinWorkingHours
        ? Project.find({
            matchedAt: { $exists: true },
            status: 'Quote Requested',
            inQueue: false,
            'timeLeftInQueue.h': { $gte: 0 },
            showQuotesAfter24Hour: false
          })
            .populate('findSpaceUserId')
            .exec()
        : Promise.resolve([])
    ]);

    // ── Run all task groups in parallel ──
    await Promise.all([
      processInvoiceTickets(allInvoices),
      processQuoteDeliveredProjects(allQuoteDelivered),
      processWarehouseSelectedProjects(allWarehouseSelected),
      processInvoiceNotifications(allProjectsActive),
      processInQueueProjects(inQueueProjects),
      processQuoteTimedProjects(projectsToShowQuotes)
    ]);
  }

  // ─────────────────────────────────────────────
  //  TASK 1 — Projects in queue (timer tick)
  // ─────────────────────────────────────────────
  async function processInQueueProjects(projects) {
    if (!projects.length) return;

    await processInChunks(projects, CHUNK_SIZE, async (project) => {
      const timeSpent = project.inQueueUptimeInSeconds + 60;
      const timeLeftInQueue =
        timeConverter.convertSecondsIntoTimeLeftProject(timeSpent);
      const { h, m } = timeLeftInQueue;
      const update = { inQueueUptimeInSeconds: timeSpent, timeLeftInQueue };

      if (h === 0 && m === 0) {
        update.inQueue = false;
        const body = {
          projectId: project._id,
          listingsArray: project.matchedListings.map((l) => l.listing)
        };
        // fire-and-forget — don't block the update
        axios
          .post(`${config.url}/manager/submit-project-specs`, body)
          .catch(console.error);
      }

      return Project.updateOne({ _id: project._id }, { $set: update });
    });
  }

  // ─────────────────────────────────────────────
  //  TASK 2 — Quote window tracking (24h / 40h)
  //  Eliminated N+1: one Quotes query instead of
  //  one per listing per project
  // ─────────────────────────────────────────────
  async function processQuoteTimedProjects(projects) {
    if (!projects.length) return;

    // Collect all listing IDs across all projects
    const projectIds = projects.map((p) => p._id);
    const allListingIds = projects.flatMap((p) => p.assignedListings);

    // Single batch query replaces N×M individual findOne calls
    const allQuotes = await Quotes.find({
      projectId: { $in: projectIds },
      listId: { $in: allListingIds }
    })
      .lean()
      .exec();

    // Build lookup map: "projectId_listId" -> quote
    const quotesMap = new Map();
    allQuotes.forEach((q) => {
      quotesMap.set(`${q.projectId}_${q.listId}`, q);
    });

    await processInChunks(projects, CHUNK_SIZE, async (project) => {
      const matchedSeconds = project.matchedTimeInSeconds + 60;
      const update = { matchedTimeInSeconds: matchedSeconds };

      const timeInHours =
        timeConverter.convertSecondsIntoTimeLeftQuotes(matchedSeconds);

      // Determine allowed window based on project type
      const type = project && project.project_type;
      let timingAllowed;
      if (
        ['Storage or Cross-Docking', 'Storage + B2B Fulfillment'].includes(type)
      ) {
        timingAllowed = config.test ? 10 : 24;
      } else if (['Storage + B2C Fulfillment', 'Other'].includes(type)) {
        timingAllowed = config.test ? 15 : 40;
      } else if (['Storage', 'Fulfillment'].includes(type)) {
        timingAllowed = config.test ? 10 : 40;
      }

      const hitQuoteDeadline = config.test
        ? timeInHours.m >= timingAllowed
        : timeInHours.h === timingAllowed;

      // Tracks the effective assignedListings after this tick's changes,
      // for the hasAnyQuote check below — mirrors the original code's
      // behavior of reading project.assignedListings after it had already
      // been reassigned in the block above.
      let currentAssignedListings = project.assignedListings;

      if (hitQuoteDeadline) {
        const removedListings = [];
        const keptListings = [];

        for (const listingId of project.assignedListings) {
          const key = `${project._id}_${listingId}`;
          const quote = quotesMap.get(key);

          if (!quote) {
            removedListings.push(listingId);
          } else {
            keptListings.push(listingId);
            update.projectStage = 'Quote Delivered';
            if (
              !project.ownerNotifiedAboutQuoteReceived &&
              project.findSpaceUserId
            ) {
              // sender.sendTemplateEmail(...) — commented out in original
              update.ownerNotifiedAboutQuoteReceived = true;
            }
          }
        }

        currentAssignedListings = keptListings;
        update.assignedListings = keptListings;
        update.removedListingsAfter24Hours = removedListings;
      }

      // 16h / 10min (test) — no quote returned email
      const hitEmailDeadline = config.test
        ? timeInHours.m >= 10
        : timeInHours.h === 16;

      if (
        hitEmailDeadline &&
        !project.ownerNotifiedAboutQuotesRecievedAfterSixteenHours &&
        project.findSpaceUserId
      ) {
        const hasAnyQuote = currentAssignedListings.some((listingId) =>
          quotesMap.has(`${project._id}_${listingId}`)
        );

        if (!hasAnyQuote) {
          sender.sendTemplateEmail(
            'no_quote_returned_for_depoziter',
            {
              email: project.findSpaceUserId.businessEmail,
              name: project.findSpaceUserId.firstName,
              idNo: project.idNo
            },
            emailsConfig.noQuoteSubmitted,
            '',
            'Project ' + project.idNo + ' : No Quote Returned yet'
          );
        }
        update.ownerNotifiedAboutQuotesRecievedAfterSixteenHours = true;
      }

      return Project.updateOne({ _id: project._id }, { $set: update });
    });
  }

  // ─────────────────────────────────────────────
  //  TASK 3 — Create tickets for disputed/failed invoices
  // ─────────────────────────────────────────────
  async function processInvoiceTickets(allInvoices) {
    const toProcess = allInvoices.filter((invoice) => {
      if (
        invoice.status === 'Payment Disputed' &&
        invoice.ticketGeneratedAutomaticallyForDispute === false
      ) {
        if (!invoice.disputeHistory.date) return false;
        const recentDate =
          invoice.disputeHistory.reSubmittedDate || invoice.disputeHistory.date;
        const deadline = new Date(recentDate);
        deadline.setDate(deadline.getDate() + 3);

        return deadline <= Date.now();
      }
      if (
        invoice.status === 'Payment Failed' &&
        invoice.ticketGeneratedAutomaticallyForFailed === false
      ) {
        return true;
      }

      return false;
    });

    if (!toProcess.length) return;

    await processInChunks(toProcess, CHUNK_SIZE, async (invoice) => {
      try {
        const count = await Tickets.countDocuments({});
        const description =
          invoice.status === 'Payment Disputed'
            ? `This is an autogenerated ticket to report the below incident - <br/>Invoice Number ${invoice.globalInvoiceNumber} was disputed by Shipper (${invoice.findSpaceUserId.businessEmail}) on ${moment(invoice.disputeHistory.date).format('MM/DD/YYYY')}, and no action has been entered in the system for the same, since three days.`
            : `This is an autogenerated ticket to report the below incident - <br/>Invoice Number ${invoice.globalInvoiceNumber} against project ${invoice.project ? invoice.project.idNo : 'N/A'} has failed when run on ${invoice.failedHistory.reSubmittedDate ? moment(invoice.failedHistory.reSubmittedDate).format('MM/DD/YYYY') : moment(invoice.failedHistory.date).format('MM/DD/YYYY')}.`;

        const ticket = new Tickets({
          ticketId: `TK${padLeft(count + 1, 4)}`,
          automaticallyCreated: true,
          projectId: invoice.project
            ? mongoose.Types.ObjectId(invoice.project._id)
            : null,
          listingId: mongoose.Types.ObjectId(invoice.listing),
          issueWith: 'Customer Support',
          withRespectTo: 'Manager',
          description,
          status: 'New',
          createdAt: Date.now()
        });
        await ticket.save();

        const ticketFlagUpdate =
          invoice.status === 'Payment Disputed'
            ? { ticketGeneratedAutomaticallyForDispute: true }
            : { ticketGeneratedAutomaticallyForFailed: true };
        await Invoice.updateOne(
          { _id: invoice._id },
          { $set: ticketFlagUpdate }
        );
      } catch (err) {
        console.error('[QueueTracker] ticket creation error:', err.message);
      }
    });
  }

  // ─────────────────────────────────────────────
  //  TASK 4 — Quote Delivered stage timer
  // ─────────────────────────────────────────────
  async function processQuoteDeliveredProjects(projects) {
    if (!projects.length) return;

    await processInChunks(projects, CHUNK_SIZE, async (project) => {
      const timeSpent = project.uptimeAsQuoteDeliveredStage + 60;
      const timeLeftAsQuoteDeliveredStage =
        timeConverter.convertSecondsIntoTimeLeftNonResponsiveStages(
          timeSpent,
          86400
        );
      const { h, m } = timeLeftAsQuoteDeliveredStage;
      const update = {
        uptimeAsQuoteDeliveredStage: timeSpent,
        timeLeftAsQuoteDeliveredStage
      };

      if (h === 0 && m === 0) {
        if (
          !project.salesTeamNotifiedAboutQuoteDeliveredStage &&
          project.findSpaceUserId
        ) {
          sender.sendTemplateEmail(
            'quoteDeliveredandnoActivityAfter72Hours',
            {
              email: project.findSpaceUserId.businessEmail,
              name: project.findSpaceUserId.firstName,
              idNo: project.idNo,
              url: config.url,
              ticket_url: config.url + '/buyer/ticket/?redirect=true',
              logo: config.url + '/assets/images/logo.svg',
              toc: config.url + '/toc',
              privacy: config.url + '/privacy'
            },
            emailsConfig.noQuoteSubmitted,
            '',
            'Project ' + project.idNo + ': No Activity After 72 Hours'
          );
        }
        update.salesTeamNotifiedAboutQuoteDeliveredStage = true;
      }

      return Project.updateOne({ _id: project._id }, { $set: update });
    });
  }

  // ─────────────────────────────────────────────
  //  TASK 5 — Warehouse Selected stage timer
  // ─────────────────────────────────────────────
  async function processWarehouseSelectedProjects(projects) {
    if (!projects.length) return;

    await processInChunks(projects, CHUNK_SIZE, async (project) => {
      const timeSpent = project.uptimeAsWarehouseSelectedStage + 60;
      const timeLeftAsWarehouseSelectedStage =
        timeConverter.convertSecondsIntoTimeLeftNonResponsiveStages(
          timeSpent,
          86400
        );
      const { h, m } = timeLeftAsWarehouseSelectedStage;
      const update = {
        uptimeAsWarehouseSelectedStage: timeSpent,
        timeLeftAsWarehouseSelectedStage
      };

      if (h === 0 && m === 0) {
        const provider =
          project.quote_accepted && project.quote_accepted.listSpaceUserId;
        if (!project.salesTeamNotifiedAboutWarehouseSelectedStage && provider) {
          sender.sendTemplateEmail(
            'warehouseSelectedAndnoActivityfor72Hours',
            {
              email: provider.businessEmail,
              idNo: project.idNo,
              url: config.url,
              ticket_url: config.url + '/buyer/ticket/?redirect=true',
              logo: config.url + '/assets/images/logo.svg',
              toc: config.url + '/toc',
              privacy: config.url + '/privacy'
            },
            emailsConfig.noQuoteSubmitted,
            '',
            'Project ' + project.idNo + ': No Contract Received From Howzer'
          );
        }
        update.salesTeamNotifiedAboutWarehouseSelectedStage = true;
      }

      return Project.updateOne({ _id: project._id }, { $set: update });
    });
  }

  // ─────────────────────────────────────────────
  //  TASK 6 — Howzer invoice notification (30 days+)
  //  Eliminated N+1: replaces per-project Invoice.findOne
  //  loop with a single batch Invoice.find
  // ─────────────────────────────────────────────
  async function processInvoiceNotifications(activeProjects) {
    if (!activeProjects.length) return;

    // Filter to projects where updatedAt + 30 days has passed
    const now = Date.now();
    const oldProjects = activeProjects.filter((p) => {
      const threshold = new Date(p.updatedAt);
      threshold.setDate(threshold.getDate() + 30);

      return threshold <= now;
    });

    if (!oldProjects.length) return;

    const projectIds = oldProjects.map((p) => p._id);

    // Single query for ALL invoices across all relevant projects
    const allInvoices = await Invoice.find({
      project: { $in: projectIds }
    })
      .lean()
      .exec();

    // Map: projectId (string) -> invoices[]
    const invoicesByProject = new Map();
    allInvoices.forEach((inv) => {
      const pid = inv.project.toString();
      if (!invoicesByProject.has(pid)) invoicesByProject.set(pid, []);
      invoicesByProject.get(pid).push(inv);
    });

    // Identify which projects need notification
    const toNotify = oldProjects.filter((p) => {
      if (p.howzerToBeNotifiedAboutInvoiceEmail) return false;
      const invoices = invoicesByProject.get(p._id.toString()) || [];
      const hasNoInvoice = invoices.length === 0;
      const hasDraftInvoice = invoices.some((inv) => inv.status === 'Draft');

      return hasNoInvoice || hasDraftInvoice;
    });

    if (!toNotify.length) return;

    await processInChunks(toNotify, CHUNK_SIZE, async (project) => {
      // email send is commented out in original — preserving that intent
      return Project.updateOne(
        { _id: project._id },
        { $set: { howzerToBeNotifiedAboutInvoiceEmail: true } }
      );
    });
  }

  return {
    name: 'QueueTimeTracker',
    rule: '* * * * *',
    run: async () => {
      if (isRunning) return;
      isRunning = true;
      try {
        await runScheduledTasks();
      } catch (err) {
        console.error('[QueueTracker] unhandled error:', err.message);
      } finally {
        isRunning = false;
      }
    }
  };
};
