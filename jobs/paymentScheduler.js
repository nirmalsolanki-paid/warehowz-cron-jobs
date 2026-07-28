const mongoose = require('mongoose');
const moment = require('moment');
const async = require('async');
const { refreshCardFromStripe } = require('../lib/stripeCardSync');

module.exports = (ctx) => {
  const { config, sender, emailsConfig, stripe } = ctx;
  const Invoice = mongoose.model('Invoice');
  const Card = mongoose.model('Card');
  const Stripe = mongoose.model('Stripe');
  const Transaction = mongoose.model('Transaction');
  const Log = mongoose.model('Log');
  const { buildContinuityAuthQuery } = require('../lib/continuity_auth')(
    config
  );

  /**
   * Function to create error logs for stripe.
   *
   * @param invoice the invoice tied to the error
   * @param err error
   * @param cb returns the log
   */
  var logFunction = (invoice, err, cb) => {
    var log = new Log();
    log.code = err.raw.code;
    log.declineCode = err.raw.decline_code;
    log.message = err.raw.message;
    log.type = err.raw.type;
    log.url = err.raw.doc_url;
    log.requestId = err.raw.requestId;
    log.findSpaceUserId = invoice.findSpaceUserId;
    log.listSpaceUserId = invoice.listSpaceUserId;
    if (invoice.constructor && invoice.constructor.modelName === 'Invoice') {
      log.invoiceId = invoice._id;
    }
    log.save((err, log) => {
      if (err) {
        cb(err);

        return;
      }
      cb(err, log);
    });
  };

  return {
    name: 'PaymentScheduler',
    rule: { hour: 5, minute: [1] },
    run: () =>
      new Promise((resolve) => {
        console.log('***Payment Scheduler started***');
        var invoicesArray = [];
        var allInvoices = [];
        var dailyFailedPaymentReport = [];
        var dailyDisputeReport = [];
        var yesterday = moment().add(-1, 'days');

        function addDays(theDate, days) {
          return new Date(theDate.getTime() + days * 24 * 60 * 60 * 1000);
        }

        const isToday = (someDate) => {
          const today = new Date();

          return (
            someDate.getDate() == today.getDate() &&
            someDate.getMonth() == today.getMonth() &&
            someDate.getFullYear() == today.getFullYear()
          );
        };
        async.series(
          [
            (cb) => {
              Invoice.find({
                delete: false,
                status: 'Payment Succeeded'
              }).exec((err, invoices) => {
                if (err) {
                  cb(err);

                  return;
                }
                allInvoices = invoices;
                cb();
              });
            },
            (cb) => {
              Invoice.find({
                delete: false,
                status: 'Payment Failed',
                createdAt: { $gte: new Date('2021,09,10') },
                'failedHistory.date': { $ne: null },
                'failedHistory.failedCount': { $lt: 3 }
              }).exec((err, paymentFailedInvoices) => {
                if (err) {
                  cb(err);

                  return;
                }
                async.eachSeries(
                  paymentFailedInvoices,
                  (invoice, callback) => {
                    let daysSinceFailed;
                    if (invoice.failedHistory.reSubmitted) {
                      daysSinceFailed = moment(new Date()).diff(
                        moment(new Date(invoice.failedHistory.reSubmittedDate)),
                        'days'
                      );
                    } else {
                      daysSinceFailed = moment().diff(
                        moment(new Date(invoice.failedHistory.date)),
                        'days'
                      );
                    }
                    //daysSinceFailed=3; // To Change (done)
                    if (daysSinceFailed >= 3) {
                      invoice.failedHistory.reSubmittedDate = new Date();
                      invoice.failedHistory.reSubmitted = true;
                      invoice.status = 'Released';
                      invoice.ticketGeneratedAutomaticallyForFailed = false;
                      invoice.paymentDue = new Date();
                      invoice.save(callback);
                    } else {
                      callback();
                    }
                  },
                  (err) => {
                    if (err) {
                      cb(err);
                    } else {
                      cb();
                    }
                  }
                );
              });
            },
            (cb) => {
              Invoice.find({
                delete: false,
                status: 'Released',
                invoiceDate: {
                  $lte: new Date()
                },

                // To change (remove comment line 380 381 382 383) (done)
                paymentDue: {
                  $gte: yesterday.startOf('day').utc(),
                  $lte: new Date()
                }
              })
                .populate('findSpaceUserId listSpaceUserId')
                .exec((err, invoices) => {
                  if (err) {
                    cb(err);

                    return;
                  }
                  if (invoices.length) {
                    invoicesArray = invoices;
                    cb();
                  } else {
                    console.log('no invoices');
                    // cb(new Error('No invoice found')); return;
                    cb();
                  }
                });
            },
            (cb) => {
              Invoice.find({
                delete: false,
                $or: [
                  {
                    status: 'Payment Disputed',
                    'disputeHistory.date': {
                      $lte: new Date()
                    }
                  },
                  { status: 'Revision' }
                ]
              }).exec((err, disputeInvoiceArray) => {
                if (err) {
                  cb(err);

                  return;
                }
                if (disputeInvoiceArray.length) {
                  disputeInvoiceArray.forEach((invoice) => {
                    const report = {
                      Invoice_Number: invoice.globalInvoiceNumber
                        ? invoice.globalInvoiceNumber
                        : '0000',
                      If_dispute_resubmitted:
                        invoice.status === 'Payment Disputed'
                          ? invoice.disputeHistory.reSubmitted == false
                            ? 'No'
                            : 'Yes'
                          : 'N/A',
                      Days_since_dispute:
                        invoice.status === 'Payment Disputed'
                          ? moment(new Date()).diff(
                              moment(new Date(invoice.disputeHistory.date)),
                              'days'
                            )
                          : 'N/A',
                      dispute_status: invoice.status
                        ? invoice.status === 'Revision'
                          ? 'Invoice Disputed'
                          : invoice.status
                        : ''
                    };
                    dailyDisputeReport.push(report);
                  });
                  cb();
                } else {
                  cb();
                }
              });
            },
            // cb => {
            //     Invoice.find({
            //         delete: false,
            //         status: 'Payment InComplete'
            //       })
            //         .populate('findSpaceUserId')
            //         .exec((err, invoicesIncomplete) => {
            //             if (err) {
            //                 return;
            //             }
            //             if (invoicesIncomplete.length) {
            //                 invoicesArray = [...invoicesArray,...invoicesIncomplete];
            //                 cb();
            //             } else {
            //                 // cb(new Error('No invoice found')); return;
            //                 cb();
            //             }
            //         });
            // },
            (cb) => {
              async.eachSeries(
                invoicesArray,
                (invoice, callback) => {
                  Invoice.findOne({ _id: invoice._id })
                    .populate('listSpaceUserId findSpaceUserId project')
                    .exec((err, invoice) => {
                      if (err) {
                        callback(err);

                        return;
                      }
                      if (
                        invoice &&
                        (!invoice.findSpaceUserId || !invoice.listSpaceUserId)
                      ) {
                        // Buyer or provider account was deleted — skip this invoice
                        return callback();
                      }
                      if (invoice) {
                        Card.findOne({
                          findSpaceUserId: invoice.findSpaceUserId._id
                        }).exec(async (err, card) => {
                          if (err) {
                            cb(err);

                            return;
                          }
                          if (card) {
                            try {
                              await refreshCardFromStripe(stripe, card);
                            } catch (syncErr) {
                              console.log(
                                `Failed to refresh card from Stripe for customer ${card.customerId}:`,
                                syncErr.message
                              );
                            }
                          }
                          const cardPendingVerification =
                            card &&
                            (card.type === 'bank_account' || card.type === 'ach') &&
                            card.status !== 'Verified';
                          if (card && !card.delete && !cardPendingVerification) {
                            let creditCardCharge = '';

                            var per = (10 / 100) * invoice.due;
                            per = parseInt(per);
                            // var balance = parseInt(invoice.due) - parseInt(invoice.due);
                            var clientFee = parseFloat(invoice.clientFee || 0);
                            var shipperFee = parseFloat(
                              invoice.shipperServiceFee || 0
                            );
                            var total = parseFloat(invoice.total) + shipperFee;
                            var warehowzCommission = clientFee + shipperFee;

                            if (
                              card.stripeTokenType == 'card' ||
                              card.type == 'card'
                            ) {
                              creditCardCharge = 0.03 * total;
                              total = total * 1.03;
                              warehowzCommission =
                                warehowzCommission + creditCardCharge;
                            }

                            Stripe.findOne({
                              listSpaceUserId: invoice.listSpaceUserId._id,
                              delete: false
                            }).exec((err, stripeAccount) => {
                              if (err) {
                                cb(err);

                                return;
                              }
                              if (stripeAccount) {
                                const _chargeAmount = Math.round(
                                  total.toFixed(2) * 100
                                );
                                const _feeAmount = Math.round(
                                  warehowzCommission.toFixed(2) * 100
                                );
                                const _description =
                                  invoice.globalInvoiceNumber || '';

                                const _isCard = card.type === 'card';
                                const _chargePromise = stripe.paymentIntents
                                  .create({
                                    amount: _chargeAmount,
                                    currency: 'usd',
                                    description: _description,
                                    customer: card.customerId,
                                    payment_method: card.paymentMethodId,
                                    payment_method_types: _isCard
                                      ? ['card']
                                      : ['us_bank_account'],
                                    confirm: true,
                                    ...(!_isCard &&
                                      card.mandateId && {
                                        mandate: card.mandateId
                                      }),
                                    application_fee_amount: _feeAmount,
                                    transfer_data: {
                                      destination: stripeAccount.accountId
                                    },
                                    expand: ['latest_charge']
                                  })
                                  .then((pi) => ({
                                    id: pi.id,
                                    amount: pi.amount,
                                    amount_refunded: pi.latest_charge
                                      ? pi.latest_charge.amount_refunded
                                      : 0,
                                    customer: pi.customer,
                                    balance_transaction: pi.latest_charge
                                      ? pi.latest_charge.balance_transaction
                                      : '',
                                    currency: pi.currency,
                                    payment_method_details: {
                                      type: _isCard ? 'card' : 'us_bank_account'
                                    },
                                    transfer: pi.latest_charge
                                      ? pi.latest_charge.transfer
                                      : '',
                                    transfer_group: pi.transfer_group,
                                    status:
                                      pi.status === 'processing'
                                        ? 'pending'
                                        : pi.status
                                  }));

                                _chargePromise
                                  .then((charge) => {
                                    var transaction = new Transaction();
                                    transaction.listSpaceUserId =
                                      invoice.listSpaceUserId;
                                    transaction.findSpaceUserId =
                                      invoice.findSpaceUserId;
                                    transaction.amount = charge.amount;
                                    transaction.refunded = charge.amount_refunded;
                                    transaction.customerId = charge.customer;
                                    transaction.balance_transaction =
                                      charge.balance_transaction;
                                    transaction.currency = charge.currency;
                                    transaction.type =
                                      charge.payment_method_details.type;
                                    transaction.transferId = charge.transfer;
                                    transaction.transfer_group =
                                      charge.transfer_group;
                                    transaction.paymentId = charge.id;
                                    transaction.status = charge.status;
                                    transaction.invoice = invoice._id;
                                    transaction.save((err, transaction) => {
                                      if (err) {
                                        callback(err);

                                        return;
                                      }
                                      let buyerEmailTemplate = 'invoice_succeeded';
                                      let providerEmailTemplate =
                                        'invoice_succeeded_howzer';
                                      let emailSubject =
                                        'Invoice has been cleared successfully';

                                      if (transaction.status == 'pending') {
                                        invoice.status = 'Pending';
                                        buyerEmailTemplate =
                                          'invoice_under_processing';
                                        providerEmailTemplate =
                                          'invoice_under_processing';
                                        emailSubject = `The invoice #${invoice.globalInvoiceNumber} is under processing`;
                                      } else {
                                        invoice.status = 'Payment Succeeded';
                                        invoice.paymentSucceededOn = new Date();
                                      }
                                      invoice.paymentStatus = transaction.status;

                                      invoice.processDates.push(new Date());
                                      const operatorsBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter(
                                            (userObj) =>
                                              userObj.role.toLowerCase() ===
                                                'operator' &&
                                              userObj.notificationRoles.length == 0
                                          )
                                          .map((userObj) => userObj.email);
                                      const notificationOperatorsBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter((userObj) =>
                                            userObj.notificationRoles.length > 0
                                              ? userObj.notificationRoles.includes(
                                                  'Operator'
                                                )
                                              : false
                                          )
                                          .map((userObj) => userObj.email);
                                      const invoicingBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter((userObj) =>
                                            userObj.notificationRoles.length > 0
                                              ? userObj.notificationRoles.includes(
                                                  'Invoicing'
                                                )
                                              : false
                                          )
                                          .map((userObj) => userObj.email);
                                      const adminBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter(
                                            (userObj) =>
                                              userObj.role.toLowerCase() === 'admin'
                                          )
                                          .map((userObj) => userObj.email);

                                      const buyerLocals = {
                                        name: invoice.findSpaceUserId
                                          ? invoice.findSpaceUserId.firstName +
                                            ' ' +
                                            invoice.findSpaceUserId.lastName
                                          : '',
                                        providerName: invoice.listSpaceUserId
                                          ? invoice.listSpaceUserId.firstName +
                                            ' ' +
                                            invoice.listSpaceUserId.lastName
                                          : '',
                                        invoiceNumber: invoice.globalInvoiceNumber
                                          ? invoice.globalInvoiceNumber
                                          : '0000',
                                        projectNumber: invoice.project.idNo,
                                        url: config.url,
                                        logo:
                                          config.url + '/assets/images/logo.svg',
                                        toc: config.url + '/toc',
                                        privacy: config.url + '/privacy',
                                        continuity_url:
                                          config.url +
                                          '/buyer/all-invoices/' +
                                          invoice._id +
                                          buildContinuityAuthQuery(
                                            invoice.findSpaceUserId.businessEmail,
                                            invoice._id
                                          ),
                                        continuity_text: 'View Invoice',
                                        ticket_url:
                                          config.url +
                                          `/buyer/ticket/?redirect=true`
                                      };

                                      // let providerLocals = {
                                      //   name:  invoice.listSpaceUserId ? (invoice.listSpaceUserId.firstName + " " + invoice.listSpaceUserId.lastName) :'',
                                      //   invoiceNumber:  invoice.globalInvoiceNumber ?  invoice.globalInvoiceNumber: '0000',
                                      //   project: invoice.project.idNo,
                                      //   email: invoice.findSpaceUserId.businessEmail,
                                      //   url: config.url,
                                      //   logo: config.url + '/assets/images/logo.svg',
                                      //   toc: config.url + '/toc',
                                      //   privacy: config.url + '/privacy',
                                      // };
                                      // To stop all notifications for end users (resumed later)
                                      sender.sendTemplateEmail(
                                        buyerEmailTemplate,
                                        buyerLocals,
                                        invoice.findSpaceUserId.businessEmail,
                                        [
                                          ...operatorsBuyer,
                                          ...notificationOperatorsBuyer,
                                          ...invoicingBuyer,
                                          ...adminBuyer
                                        ],
                                        emailSubject
                                      );
                                      const operators =
                                        invoice.listSpaceUserId.additionalEmail
                                          .filter(
                                            (userObj) =>
                                              userObj.role.toLowerCase() ===
                                                'operator' &&
                                              userObj.notificationRoles.length == 0
                                          )
                                          .map((userObj) => userObj.email);
                                      const notificationOperators =
                                        invoice.listSpaceUserId.additionalEmail
                                          .filter((userObj) =>
                                            userObj.notificationRoles.length > 0
                                              ? userObj.notificationRoles.includes(
                                                  'Operator'
                                                )
                                              : false
                                          )
                                          .map((userObj) => userObj.email);
                                      const invoicing =
                                        invoice.listSpaceUserId.additionalEmail
                                          .filter((userObj) =>
                                            userObj.notificationRoles.length > 0
                                              ? userObj.notificationRoles.includes(
                                                  'Invoicing'
                                                )
                                              : false
                                          )
                                          .map((userObj) => userObj.email);
                                      const admin =
                                        invoice.listSpaceUserId.additionalEmail
                                          .filter(
                                            (userObj) =>
                                              userObj.role.toLowerCase() === 'admin'
                                          )
                                          .map((userObj) => userObj.email);

                                      const providerLocals = {
                                        name: invoice.listSpaceUserId
                                          ? invoice.listSpaceUserId.firstName +
                                            ' ' +
                                            invoice.listSpaceUserId.lastName
                                          : '',
                                        invoiceNumber: invoice.globalInvoiceNumber
                                          ? invoice.globalInvoiceNumber
                                          : '0000',
                                        buyername: invoice.findSpaceUserId
                                          ? invoice.findSpaceUserId.firstName +
                                            ' ' +
                                            invoice.findSpaceUserId.lastName
                                          : '',
                                        projectNumber: invoice.project.idNo,
                                        email:
                                          invoice.listSpaceUserId.businessEmail,
                                        url: config.url,
                                        logo:
                                          config.url + '/assets/images/logo.svg',
                                        toc: config.url + '/toc',
                                        privacy: config.url + '/privacy',
                                        continuity_url:
                                          config.url +
                                          '/provider/all-invoices/' +
                                          invoice._id +
                                          buildContinuityAuthQuery(
                                            invoice.listSpaceUserId.businessEmail,
                                            invoice._id
                                          ),
                                        continuity_text: 'View Invoice',
                                        ticket_url:
                                          config.url +
                                          `/provider/ticket/?redirect=true`
                                      };
                                      // To stop all notifications for end users (resumed later)
                                      sender.sendTemplateEmail(
                                        providerEmailTemplate,
                                        providerLocals,
                                        invoice.listSpaceUserId.businessEmail,
                                        [
                                          ...operators,
                                          ...notificationOperators,
                                          ...invoicing,
                                          ...admin
                                        ],
                                        emailSubject
                                      );
                                      invoice.save(callback);
                                    });
                                  })
                                  .catch((err) => {
                                    logFunction(invoice, err, (error, log) => {
                                      invoice.failedHistory.date =
                                        invoice.failedHistory.date == null
                                          ? Date.now()
                                          : invoice.failedHistory.date;
                                      const report = {
                                        Invoice_Number: invoice.globalInvoiceNumber
                                          ? invoice.globalInvoiceNumber
                                          : '0000',
                                        If_failed_payment_resubmitted:
                                          invoice.failedHistory.reSubmitted == false
                                            ? 'No'
                                            : 'Yes',
                                        Days_since_failure:
                                          invoice.failedHistory.date == null
                                            ? 0
                                            : moment(new Date()).diff(
                                                moment(
                                                  new Date(
                                                    invoice.failedHistory.date
                                                  )
                                                ),
                                                'days'
                                              )
                                      };
                                      dailyFailedPaymentReport.push(report);
                                      invoice.status = 'Payment Failed';
                                      invoice.ticketGeneratedAutomaticallyForFailed = false;
                                      invoice.paymentStatus = err.raw.code;
                                      invoice.processDates.push(new Date());
                                      invoice.failedHistory.reSubmitted =
                                        invoice.failedHistory.date == null
                                          ? invoice.failedHistory.reSubmitted
                                          : true;
                                      invoice.failedHistory.failedCount =
                                        invoice.failedHistory.failedCount + 1;
                                      const operatorsBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter(
                                            (userObj) =>
                                              userObj.role.toLowerCase() ===
                                                'operator' &&
                                              userObj.notificationRoles.length == 0
                                          )
                                          .map((userObj) => userObj.email);
                                      const notificationOperatorsBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter((userObj) =>
                                            userObj.notificationRoles.length > 0
                                              ? userObj.notificationRoles.includes(
                                                  'Operator'
                                                )
                                              : false
                                          )
                                          .map((userObj) => userObj.email);
                                      const invoicingBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter((userObj) =>
                                            userObj.notificationRoles.length > 0
                                              ? userObj.notificationRoles.includes(
                                                  'Invoicing'
                                                )
                                              : false
                                          )
                                          .map((userObj) => userObj.email);
                                      const adminBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter(
                                            (userObj) =>
                                              userObj.role.toLowerCase() === 'admin'
                                          )
                                          .map((userObj) => userObj.email);

                                      const buyerLocals = {
                                        name: invoice.findSpaceUserId
                                          ? invoice.findSpaceUserId.firstName +
                                            ' ' +
                                            invoice.findSpaceUserId.lastName
                                          : '',
                                        providerName: invoice.listSpaceUserId
                                          ? invoice.listSpaceUserId.firstName +
                                            ' ' +
                                            invoice.listSpaceUserId.lastName
                                          : '',
                                        invoiceNumber: invoice.globalInvoiceNumber
                                          ? invoice.globalInvoiceNumber
                                          : '0000',
                                        projectNumber: invoice.project.idNo,
                                        url: config.url,
                                        logo:
                                          config.url + '/assets/images/logo.svg',
                                        toc: config.url + '/toc',
                                        privacy: config.url + '/privacy',
                                        continuity_url:
                                          config.url +
                                          '/buyer/all-invoices/' +
                                          invoice._id +
                                          buildContinuityAuthQuery(
                                            invoice.findSpaceUserId.businessEmail,
                                            invoice._id
                                          ),
                                        continuity_text: 'View Invoice',
                                        ticket_url:
                                          config.url +
                                          `/buyer/ticket/?redirect=true`
                                      };
                                      const supportLocals = {
                                        name: invoice.findSpaceUserId
                                          ? invoice.findSpaceUserId.firstName +
                                            ' ' +
                                            invoice.findSpaceUserId.lastName
                                          : '',
                                        providerName: invoice.listSpaceUserId
                                          ? invoice.listSpaceUserId.firstName +
                                            ' ' +
                                            invoice.listSpaceUserId.lastName
                                          : '',
                                        invoiceNumber: invoice.globalInvoiceNumber
                                          ? invoice.globalInvoiceNumber
                                          : '0000',
                                        projectNumber: invoice.project.idNo,
                                        url: config.url,
                                        logo:
                                          config.url + '/assets/images/logo.svg',
                                        toc: config.url + '/toc',
                                        privacy: config.url + '/privacy',
                                        continuity_url:
                                          config.url +
                                          '/manager/invoice/view/' +
                                          invoice._id,
                                        continuity_text: 'View Invoice'
                                      };

                                      let dataObjProvider = {
                                        businessEmail:
                                          invoice.listSpaceUserId.businessEmail,
                                        firstName: `${invoice.listSpaceUserId.firstName}`,
                                        lastName: `${invoice.listSpaceUserId.lastName}`,
                                        accountType: 'Provider'
                                      };

                                      dataObjProvider =
                                        JSON.stringify(dataObjProvider);
                                      const encodedDataProvider =
                                        Buffer.from(dataObjProvider).toString(
                                          'base64'
                                        );

                                      // let providerLocals = {
                                      //   name: invoice.listSpaceUserId
                                      //     ? invoice.listSpaceUserId.firstName +
                                      //     ' ' +
                                      //     invoice.listSpaceUserId.lastName
                                      //     : '',
                                      //   invoiceNumber: invoice.globalInvoiceNumber
                                      //     ? invoice.globalInvoiceNumber
                                      //     : '0000',
                                      //   projectNumber: invoice.project.idNo,
                                      //   email:
                                      //     invoice.findSpaceUserId.businessEmail,
                                      //   url: config.url,
                                      //   logo:
                                      //     config.url + '/assets/images/logo.svg',
                                      //   toc: config.url + '/toc',
                                      //   privacy: config.url + '/privacy',
                                      //   ticket_url: config.url + `/getHelpEmail?data=${encodedDataProvider}`,
                                      // };

                                      // if (!invoice.invoice_failed_buyer) {
                                      //   sender.sendTemplateEmail(
                                      //     'invoice_failed_buyer',
                                      //     buyerLocals,
                                      //     invoice.findSpaceUserId.businessEmail,
                                      //     '',
                                      //     'Payment Failed'
                                      //   );

                                      //   invoice.invoice_failed_buyer = true;
                                      // }
                                      // To stop all notifications for end users (resumed later)
                                      sender.sendTemplateEmail(
                                        'invoice_failed_buyer',
                                        buyerLocals,
                                        invoice.findSpaceUserId.businessEmail,
                                        [
                                          ...operatorsBuyer,
                                          ...notificationOperatorsBuyer,
                                          ...invoicingBuyer,
                                          ...adminBuyer
                                        ],
                                        'Payment Failed'
                                      );

                                      // sender.sendTemplateEmail(
                                      //   'invoice_failed_provider',
                                      //   providerLocals,
                                      //   invoice.listSpaceUserId.businessEmail,
                                      //   '',
                                      //   'Payment Failed'
                                      // );
                                      sender.sendTemplateEmail(
                                        'invoice_failed_supportteam',
                                        supportLocals,
                                        emailsConfig.supportMail,
                                        '',
                                        'Payment Failed'
                                      );
                                      if (invoice.failedHistory.failedCount == 3) {
                                        sender.sendTemplateEmail(
                                          'invoice_failed_third_time_support',
                                          supportLocals,
                                          emailsConfig.invoiceDisputedTwice,
                                          '',
                                          `Invoice #${invoice.globalInvoiceNumber} Has Failed To Clear Payment Third Time.`
                                        );
                                      }

                                      invoice.save((err) => {
                                        callback(error);

                                        return;
                                      });
                                    });
                                  });
                              } else {
                                invoice.failedHistory.date =
                                  invoice.failedHistory.date == null
                                    ? Date.now()
                                    : invoice.failedHistory.date;
                                const report = {
                                  Invoice_Number: invoice.globalInvoiceNumber
                                    ? invoice.globalInvoiceNumber
                                    : '0000',
                                  If_failed_payment_resubmitted:
                                    invoice.failedHistory.reSubmitted == false
                                      ? 'No'
                                      : 'Yes',
                                  Days_since_failure:
                                    invoice.failedHistory.date == null
                                      ? 0
                                      : moment(new Date()).diff(
                                          moment(
                                            new Date(invoice.failedHistory.date)
                                          ),
                                          'days'
                                        )
                                };
                                dailyFailedPaymentReport.push(report);
                                invoice.paymentStatus =
                                  'no stripe account found , Charge';
                                invoice.status = 'Payment Failed';
                                invoice.ticketGeneratedAutomaticallyForFailed = false;
                                invoice.processDates.push(new Date());
                                invoice.failedHistory.reSubmitted =
                                  invoice.failedHistory.date == null
                                    ? invoice.failedHistory.reSubmitted
                                    : true;
                                invoice.failedHistory.failedCount =
                                  invoice.failedHistory.failedCount + 1;
                                const operatorsBuyer =
                                  invoice.findSpaceUserId.additionalEmail
                                    .filter(
                                      (userObj) =>
                                        userObj.role.toLowerCase() === 'operator' &&
                                        userObj.notificationRoles.length == 0
                                    )
                                    .map((userObj) => userObj.email);
                                const notificationOperatorsBuyer =
                                  invoice.findSpaceUserId.additionalEmail
                                    .filter((userObj) =>
                                      userObj.notificationRoles.length > 0
                                        ? userObj.notificationRoles.includes(
                                            'Operator'
                                          )
                                        : false
                                    )
                                    .map((userObj) => userObj.email);
                                const invoicingBuyer =
                                  invoice.findSpaceUserId.additionalEmail
                                    .filter((userObj) =>
                                      userObj.notificationRoles.length > 0
                                        ? userObj.notificationRoles.includes(
                                            'Invoicing'
                                          )
                                        : false
                                    )
                                    .map((userObj) => userObj.email);
                                const adminBuyer =
                                  invoice.findSpaceUserId.additionalEmail
                                    .filter(
                                      (userObj) =>
                                        userObj.role.toLowerCase() === 'admin'
                                    )
                                    .map((userObj) => userObj.email);

                                const buyerLocals = {
                                  name: invoice.findSpaceUserId
                                    ? invoice.findSpaceUserId.firstName +
                                      ' ' +
                                      invoice.findSpaceUserId.lastName
                                    : '',
                                  providerName: invoice.listSpaceUserId
                                    ? invoice.listSpaceUserId.firstName +
                                      ' ' +
                                      invoice.listSpaceUserId.lastName
                                    : '',
                                  invoiceNumber: invoice.globalInvoiceNumber
                                    ? invoice.globalInvoiceNumber
                                    : '0000',
                                  projectNumber: invoice.project.idNo,
                                  url: config.url,
                                  logo: config.url + '/assets/images/logo.svg',
                                  toc: config.url + '/toc',
                                  privacy: config.url + '/privacy',
                                  continuity_url:
                                    config.url +
                                    '/buyer/all-invoices/' +
                                    invoice._id +
                                    buildContinuityAuthQuery(
                                      invoice.findSpaceUserId.businessEmail,
                                      invoice._id
                                    ),
                                  continuity_text: 'View Invoice',
                                  ticket_url:
                                    config.url + `/buyer/ticket/?redirect=true`
                                };

                                let dataObjProvider = {
                                  businessEmail:
                                    invoice.listSpaceUserId.businessEmail,
                                  firstName: `${invoice.listSpaceUserId.firstName}`,
                                  lastName: `${invoice.listSpaceUserId.lastName}`,
                                  accountType: 'Provider'
                                };

                                dataObjProvider = JSON.stringify(dataObjProvider);
                                const encodedDataProvider =
                                  Buffer.from(dataObjProvider).toString('base64');

                                // let providerLocals = {
                                //   name: invoice.listSpaceUserId
                                //     ? invoice.listSpaceUserId.firstName +
                                //     ' ' +
                                //     invoice.listSpaceUserId.lastName
                                //     : '',
                                //   invoiceNumber: invoice.globalInvoiceNumber
                                //     ? invoice.globalInvoiceNumber
                                //     : '0000',
                                //   projectNumber: invoice.project.idNo,
                                //   email: invoice.findSpaceUserId.businessEmail,
                                //   url: config.url,
                                //   logo: config.url + '/assets/images/logo.svg',
                                //   toc: config.url + '/toc',
                                //   privacy: config.url + '/privacy',
                                //   ticket_url: config.url + `/getHelpEmail?data=${encodedDataProvider}`,
                                // };

                                // if (!invoice.invoice_failed_buyer) {
                                //   sender.sendTemplateEmail(
                                //     'invoice_failed_buyer',
                                //     buyerLocals,
                                //     invoice.findSpaceUserId.businessEmail,
                                //     '',
                                //     'Payment Failed'
                                //   );
                                //   invoice.invoice_failed_buyer = true;
                                // }
                                // To stop all notifications for end users (resumed later)
                                sender.sendTemplateEmail(
                                  'invoice_failed_buyer',
                                  buyerLocals,
                                  invoice.findSpaceUserId.businessEmail,
                                  [
                                    ...operatorsBuyer,
                                    ...notificationOperatorsBuyer,
                                    ...invoicingBuyer,
                                    ...adminBuyer
                                  ],
                                  'Payment Failed'
                                );
                                const supportLocals = {
                                  name: invoice.findSpaceUserId
                                    ? invoice.findSpaceUserId.firstName +
                                      ' ' +
                                      invoice.findSpaceUserId.lastName
                                    : '',
                                  providerName: invoice.listSpaceUserId
                                    ? invoice.listSpaceUserId.firstName +
                                      ' ' +
                                      invoice.listSpaceUserId.lastName
                                    : '',
                                  invoiceNumber: invoice.globalInvoiceNumber
                                    ? invoice.globalInvoiceNumber
                                    : '0000',
                                  projectNumber: invoice.project.idNo,
                                  url: config.url,
                                  logo: config.url + '/assets/images/logo.svg',
                                  toc: config.url + '/toc',
                                  privacy: config.url + '/privacy',
                                  continuity_url:
                                    config.url +
                                    '/manager/invoice/view/' +
                                    invoice._id,
                                  continuity_text: 'View Invoice'
                                };
                                if (invoice.failedHistory.failedCount == 3) {
                                  sender.sendTemplateEmail(
                                    'invoice_failed_third_time_support',
                                    supportLocals,
                                    emailsConfig.invoiceDisputedTwice,
                                    '',
                                    `Invoice #${invoice.globalInvoiceNumber} Has Failed To Clear Payment Third time.`
                                  );
                                }

                                // sender.sendTemplateEmail(
                                //   'invoice_failed_provider',
                                //   providerLocals,
                                //   invoice.listSpaceUserId.businessEmail,
                                //   '',
                                //   'Payment Failed'
                                // );

                                invoice.save(callback);
                              }
                            });
                          } else {
                            invoice.failedHistory.date =
                              invoice.failedHistory.date == null
                                ? Date.now()
                                : invoice.failedHistory.date;
                            const report = {
                              Invoice_Number: invoice.globalInvoiceNumber
                                ? invoice.globalInvoiceNumber
                                : '0000',
                              If_failed_payment_resubmitted:
                                invoice.failedHistory.reSubmitted == false
                                  ? 'No'
                                  : 'Yes',
                              Days_since_failure:
                                invoice.failedHistory.date == null
                                  ? 0
                                  : moment(new Date()).diff(
                                      moment(new Date(invoice.failedHistory.date)),
                                      'days'
                                    )
                            };
                            dailyFailedPaymentReport.push(report);
                            invoice.paymentStatus = 'no card found, Charge';
                            invoice.status = 'Payment Failed';
                            invoice.ticketGeneratedAutomaticallyForFailed = false;
                            invoice.processDates.push(new Date());
                            invoice.failedHistory.reSubmitted =
                              invoice.failedHistory.date == null
                                ? invoice.failedHistory.reSubmitted
                                : true;
                            invoice.failedHistory.failedCount =
                              invoice.failedHistory.failedCount + 1;
                            const operatorsBuyer =
                              invoice.findSpaceUserId.additionalEmail
                                .filter(
                                  (userObj) =>
                                    userObj.role.toLowerCase() === 'operator' &&
                                    userObj.notificationRoles.length == 0
                                )
                                .map((userObj) => userObj.email);
                            const notificationOperatorsBuyer =
                              invoice.findSpaceUserId.additionalEmail
                                .filter((userObj) =>
                                  userObj.notificationRoles.length > 0
                                    ? userObj.notificationRoles.includes('Operator')
                                    : false
                                )
                                .map((userObj) => userObj.email);
                            const invoicingBuyer =
                              invoice.findSpaceUserId.additionalEmail
                                .filter((userObj) =>
                                  userObj.notificationRoles.length > 0
                                    ? userObj.notificationRoles.includes(
                                        'Invoicing'
                                      )
                                    : false
                                )
                                .map((userObj) => userObj.email);
                            const adminBuyer =
                              invoice.findSpaceUserId.additionalEmail
                                .filter(
                                  (userObj) =>
                                    userObj.role.toLowerCase() === 'admin'
                                )
                                .map((userObj) => userObj.email);

                            const buyerLocals = {
                              name: invoice.findSpaceUserId
                                ? invoice.findSpaceUserId.firstName +
                                  ' ' +
                                  invoice.findSpaceUserId.lastName
                                : '',
                              providerName: invoice.listSpaceUserId
                                ? invoice.listSpaceUserId.firstName +
                                  ' ' +
                                  invoice.listSpaceUserId.lastName
                                : '',
                              invoiceNumber: invoice.globalInvoiceNumber
                                ? invoice.globalInvoiceNumber
                                : '0000',
                              projectNumber: invoice.project.idNo,
                              url: config.url,
                              logo: config.url + '/assets/images/logo.svg',
                              toc: config.url + '/toc',
                              privacy: config.url + '/privacy',
                              continuity_url:
                                config.url +
                                '/buyer/all-invoices/' +
                                invoice._id +
                                buildContinuityAuthQuery(
                                  invoice.findSpaceUserId.businessEmail,
                                  invoice._id
                                ),
                              continuity_text: 'View Invoice',
                              ticket_url:
                                config.url + `/buyer/ticket/?redirect=true`
                            };

                            let dataObjProvider = {
                              businessEmail:
                                invoice.listSpaceUserId.businessEmail,
                              firstName: `${invoice.listSpaceUserId.firstName}`,
                              lastName: `${invoice.listSpaceUserId.lastName}`,
                              accountType: 'Provider'
                            };

                            dataObjProvider = JSON.stringify(dataObjProvider);
                            const encodedDataProvider =
                              Buffer.from(dataObjProvider).toString('base64');

                            // let providerLocals = {
                            //   name: invoice.listSpaceUserId
                            //     ? invoice.listSpaceUserId.firstName +
                            //     ' ' +
                            //     invoice.listSpaceUserId.lastName
                            //     : '',
                            //   invoiceNumber: invoice.globalInvoiceNumber
                            //     ? invoice.globalInvoiceNumber
                            //     : '0000',
                            //   projectNumber: invoice.project.idNo,
                            //   email: invoice.findSpaceUserId.businessEmail,
                            //   url: config.url,
                            //   logo: config.url + '/assets/images/logo.svg',
                            //   toc: config.url + '/toc',
                            //   privacy: config.url + '/privacy',
                            //   ticket_url: config.url + `/getHelpEmail?data=${encodedDataProvider}`,
                            // };

                            // if (!invoice.invoice_failed_buyer) {
                            //   sender.sendTemplateEmail(
                            //     'invoice_failed_buyer',
                            //     buyerLocals,
                            //     invoice.findSpaceUserId.businessEmail,
                            //     '',
                            //     'Payment Failed'
                            //   );
                            //   invoice.invoice_failed_buyer = true;
                            // }
                            // To stop all notifications for end users (resumed later)
                            sender.sendTemplateEmail(
                              'invoice_failed_buyer',
                              buyerLocals,
                              invoice.findSpaceUserId.businessEmail,
                              [
                                ...operatorsBuyer,
                                ...notificationOperatorsBuyer,
                                ...invoicingBuyer,
                                ...adminBuyer
                              ],
                              'Payment Failed'
                            );

                            // sender.sendTemplateEmail(
                            //   'invoice_failed_provider',
                            //   providerLocals,
                            //   invoice.listSpaceUserId.businessEmail,
                            //   '',
                            //   'Payment Failed'
                            // );
                            const supportLocals = {
                              name: invoice.findSpaceUserId
                                ? invoice.findSpaceUserId.firstName +
                                  ' ' +
                                  invoice.findSpaceUserId.lastName
                                : '',
                              providerName: invoice.listSpaceUserId
                                ? invoice.listSpaceUserId.firstName +
                                  ' ' +
                                  invoice.listSpaceUserId.lastName
                                : '',
                              invoiceNumber: invoice.globalInvoiceNumber
                                ? invoice.globalInvoiceNumber
                                : '0000',
                              projectNumber: invoice.project.idNo,
                              url: config.url,
                              logo: config.url + '/assets/images/logo.svg',
                              toc: config.url + '/toc',
                              privacy: config.url + '/privacy',
                              continuity_url:
                                config.url + '/manager/invoice/view/' + invoice._id,
                              continuity_text: 'View Invoice'
                            };
                            if (invoice.failedHistory.failedCount == 3) {
                              sender.sendTemplateEmail(
                                'invoice_failed_third_time_support',
                                supportLocals,
                                emailsConfig.invoiceDisputedTwice,
                                '',
                                `Invoice #${invoice.globalInvoiceNumber} Has Failed To Clear Payment Third time.`
                              );
                            }

                            invoice.save(callback);
                          }
                        });
                      } else {
                        // callback();
                        invoice.failedHistory.date =
                          invoice.failedHistory.date == null
                            ? Date.now()
                            : invoice.failedHistory.date;
                        const report = {
                          Invoice_Number: invoice.globalInvoiceNumber
                            ? invoice.globalInvoiceNumber
                            : '0000',
                          If_failed_payment_resubmitted:
                            invoice.failedHistory.reSubmitted == false
                              ? 'No'
                              : 'Yes',
                          Days_since_failure:
                            invoice.failedHistory.date == null
                              ? 0
                              : moment(new Date()).diff(
                                  moment(new Date(invoice.failedHistory.date)),
                                  'days'
                                )
                        };
                        dailyFailedPaymentReport.push(report);
                        invoice.status = 'Payment Failed';
                        invoice.ticketGeneratedAutomaticallyForFailed = false;
                        invoice.paymentStatus = 'no invoice found, Charge';
                        invoice.processDates.push(new Date());
                        invoice.failedHistory.reSubmitted =
                          invoice.failedHistory.date == null
                            ? invoice.failedHistory.reSubmitted
                            : true;
                        invoice.failedHistory.failedCount =
                          invoice.failedHistory.failedCount + 1;
                        const operatorsBuyer =
                          invoice.findSpaceUserId.additionalEmail
                            .filter(
                              (userObj) =>
                                userObj.role.toLowerCase() === 'operator' &&
                                userObj.notificationRoles.length == 0
                            )
                            .map((userObj) => userObj.email);
                        const notificationOperatorsBuyer =
                          invoice.findSpaceUserId.additionalEmail
                            .filter((userObj) =>
                              userObj.notificationRoles.length > 0
                                ? userObj.notificationRoles.includes('Operator')
                                : false
                            )
                            .map((userObj) => userObj.email);
                        const invoicingBuyer =
                          invoice.findSpaceUserId.additionalEmail
                            .filter((userObj) =>
                              userObj.notificationRoles.length > 0
                                ? userObj.notificationRoles.includes('Invoicing')
                                : false
                            )
                            .map((userObj) => userObj.email);
                        const adminBuyer = invoice.findSpaceUserId.additionalEmail
                          .filter(
                            (userObj) => userObj.role.toLowerCase() === 'admin'
                          )
                          .map((userObj) => userObj.email);

                        const buyerLocals = {
                          name: invoice.findSpaceUserId
                            ? invoice.findSpaceUserId.firstName +
                              ' ' +
                              invoice.findSpaceUserId.lastName
                            : '',
                          providerName: invoice.listSpaceUserId
                            ? invoice.listSpaceUserId.firstName +
                              ' ' +
                              invoice.listSpaceUserId.lastName
                            : '',
                          invoiceNumber: invoice.globalInvoiceNumber
                            ? invoice.globalInvoiceNumber
                            : '0000',
                          projectNumber: invoice.project.idNo,
                          url: config.url,
                          logo: config.url + '/assets/images/logo.svg',
                          toc: config.url + '/toc',
                          privacy: config.url + '/privacy',
                          continuity_url:
                            config.url +
                            '/buyer/all-invoices/' +
                            invoice._id +
                            buildContinuityAuthQuery(
                              invoice.findSpaceUserId.businessEmail,
                              invoice._id
                            ),
                          continuity_text: 'View Invoice',
                          ticket_url: config.url + `/buyer/ticket/?redirect=true`
                        };

                        let dataObjProvider = {
                          businessEmail: invoice.listSpaceUserId.businessEmail,
                          firstName: `${invoice.listSpaceUserId.firstName}`,
                          lastName: `${invoice.listSpaceUserId.lastName}`,
                          accountType: 'Provider'
                        };

                        dataObjProvider = JSON.stringify(dataObjProvider);
                        const encodedDataProvider =
                          Buffer.from(dataObjProvider).toString('base64');

                        // let providerLocals = {
                        //   name: invoice.listSpaceUserId
                        //     ? invoice.listSpaceUserId.firstName +
                        //     ' ' +
                        //     invoice.listSpaceUserId.lastName
                        //     : '',
                        //   invoiceNumber: invoice.globalInvoiceNumber
                        //     ? invoice.globalInvoiceNumber
                        //     : '0000',
                        //   projectNumber: invoice.project.idNo,
                        //   email: invoice.findSpaceUserId.businessEmail,
                        //   url: config.url,
                        //   logo: config.url + '/assets/images/logo.svg',
                        //   toc: config.url + '/toc',
                        //   privacy: config.url + '/privacy',
                        //   ticket_url: config.url + `/getHelpEmail?data=${encodedDataProvider}`,
                        // };

                        // if (!invoice.invoice_failed_buyer) {
                        //   sender.sendTemplateEmail(
                        //     'invoice_failed_buyer',
                        //     buyerLocals,
                        //     invoice.findSpaceUserId.businessEmail,
                        //     '',
                        //     'Payment Failed'
                        //   );
                        //   invoice.invoice_failed_buyer = true;
                        // }
                        // To stop all notifications for end users (resumed later)
                        sender.sendTemplateEmail(
                          'invoice_failed_buyer',
                          buyerLocals,
                          invoice.findSpaceUserId.businessEmail,
                          [
                            ...operatorsBuyer,
                            ...notificationOperatorsBuyer,
                            ...invoicingBuyer,
                            ...adminBuyer
                          ],
                          'Payment Failed'
                        );

                        // sender.sendTemplateEmail(
                        //   'invoice_failed_provider',
                        //   providerLocals,
                        //   invoice.listSpaceUserId.businessEmail,
                        //   '',
                        //   'Payment Failed'
                        // );

                        const supportLocals = {
                          name: invoice.findSpaceUserId
                            ? invoice.findSpaceUserId.firstName +
                              ' ' +
                              invoice.findSpaceUserId.lastName
                            : '',
                          providerName: invoice.listSpaceUserId
                            ? invoice.listSpaceUserId.firstName +
                              ' ' +
                              invoice.listSpaceUserId.lastName
                            : '',
                          invoiceNumber: invoice.globalInvoiceNumber
                            ? invoice.globalInvoiceNumber
                            : '0000',
                          projectNumber: invoice.project.idNo,
                          url: config.url,
                          logo: config.url + '/assets/images/logo.svg',
                          toc: config.url + '/toc',
                          privacy: config.url + '/privacy',
                          continuity_url:
                            config.url + '/manager/invoice/view/' + invoice._id,
                          continuity_text: 'View Invoice'
                        };
                        if (invoice.failedHistory.failedCount == 3) {
                          sender.sendTemplateEmail(
                            'invoice_failed_third_time_support',
                            supportLocals,
                            emailsConfig.invoiceDisputedTwice,
                            '',
                            `Invoice #${invoice.globalInvoiceNumber} Has Failed To Clear Payment Third time.`
                          );
                        }
                        invoice.save(callback);
                      }
                    });
                },
                (err) => {
                  if (err) {
                    cb(err);

                    return;
                  }
                  cb();
                }
              );
            },
            (cb) => {
              const locals = {
                dailyFailedPaymentReport,
                dailyDisputeReport
              };
              sender.sendTemplateEmail(
                'invoice_daily_automated_report',
                locals,
                emailsConfig.dailyReport,
                '',
                `Invoice Daily Automated Report - ${moment.utc(new Date()).format('MM/DD/YYYY')}`
              );
              cb();
            }
            // (cb) => {
            //   let newDate;
            //   async.eachSeries(
            //     allInvoices,
            //     (invoice, callback) => {
            //       if (config.test) {
            //         newDate = addDays(invoice.paymentDue, 1);
            //       } else {
            //         newDate = addDays(invoice.paymentDue, 8);
            //       }
            //       Card.findOne({ findSpaceUserId: invoice.findSpaceUserId }).exec(
            //         (err, card) => {
            //           if (err) {
            //             cb(err);
            //             return;
            //           }
            //           // if (card && card.stripeTokenType == 'card') {
            //           if (card) {
            //             Stripe.findOne({
            //               listSpaceUserId: invoice.listSpaceUserId,
            //               delete: false,
            //             }).exec((err, stripeAccount) => {
            //               if (err) {
            //                 cb(err);
            //                 return;
            //               }
            //               var remainingAmount = (90 / 100) * invoice.due;
            //               remainingAmount = parseInt(remainingAmount);
            //               var providerPayout = (95 / 100) * invoice.total; // 95% of subTotal
            //
            //               if (stripeAccount) {
            //                 if (isToday(newDate)) {
            //                   stripe.payouts
            //                     .create(
            //                       {
            //                         amount: Math.round(
            //                           providerPayout.toFixed(2) * 100
            //                         ),
            //                         currency: 'usd',
            //                       },
            //                       {
            //                         stripe_account: stripeAccount.accountId,
            //                       }
            //                     )
            //                     .then((res) => {
            //                       // asynchronously called
            //                       Transaction.findOne({
            //                         findSpaceUserId: invoice.findSpaceUserId,
            //                         listSpaceUserId: invoice.listSpaceUserId,
            //                         invoice: invoice._id,
            //                       }).exec((err, transaction) => {
            //                         if (err) {
            //                           callback(err);
            //                           return;
            //                         }
            //                         if (transaction) {
            //                           transaction.payout = res.id;
            //                           transaction.payoutAmount = res.amount;
            //                           transaction.status = res.status;
            //                           transaction.destination = res.destination;
            //                           transaction.save((err, transaction) => {
            //                             if (err) {
            //                               callback(err);
            //                               return;
            //                             }
            //                             // if (transaction.status == 'pending') {
            //                             invoice.status = 'Payment Completed';
            //                             invoice.paymentStatus = transaction.status;
            //                             let buyerLocals = {
            //                               name: invoice.findSpaceUserId
            //                                 ? invoice.findSpaceUserId.firstName +
            //                                   ' ' +
            //                                   invoice.findSpaceUserId.lastName
            //                                 : '',
            //                               providerName: invoice.listSpaceUserId
            //                                 ? invoice.listSpaceUserId.firstName +
            //                                   ' ' +
            //                                   invoice.listSpaceUserId.lastName
            //                                 : '',
            //                               invoiceNumber: invoice.globalInvoiceNumber
            //                                 ? invoice.globalInvoiceNumber
            //                                 : '0000',
            //                               projectNumber: invoice.project.idNo,
            //                               url: config.url,
            //                               logo:
            //                                 config.url + '/assets/images/logo.svg',
            //                               toc: config.url + '/toc',
            //                               privacy: config.url + '/privacy',
            //                             };
            //                             sender.sendTemplateEmail(
            //                               'invoice_succeeded',
            //                               buyerLocals,
            //                               invoice.findSpaceUserId.businessEmail,
            //                               '',
            //                               'Invoice has been cleared successfully'
            //                             );
            //                             invoice.save(callback);
            //                             // } else {
            //                             //     console.log('payout not succeeded');
            //                             //     callback();
            //                             //     // callback(new Error('Payout not succeeded')); return;
            //                             // }
            //                           });
            //                         }
            //                       });
            //                     })
            //                     .catch((err) => {
            //                       logFunction(card, err, (error, log) => {
            //                         invoice.status = 'Payment InComplete';
            //                         invoice.paymentStatus = err.raw.code;
            //                         invoice.save((err) => {
            //                           callback(error);
            //                           return;
            //                         });
            //                       });
            //                     });
            //                 } else {
            //                   callback();
            //                 }
            //               } else {
            //                 invoice.paymentStatus =
            //                   'no stripe account found, Payout';
            //                 invoice.status = 'Payment InComplete';
            //                 invoice.save(callback);
            //               }
            //             });
            //           } else {
            //             // callback();
            //             invoice.paymentStatus = 'no payment method found, Payout';
            //             invoice.status = 'Payment InComplete';
            //             invoice.save(callback);
            //           }
            //         }
            //       );
            //     },
            //     (err) => {
            //       if (err) {
            //         cb(err);
            //         return;
            //       }
            //       cb();
            //     }
            //   );
            // },
          ],
          (err) => {
            if (err) {
              console.error('[PaymentScheduler] error:', err.message);
            }
            resolve();
          }
        );
      })
  };
};
