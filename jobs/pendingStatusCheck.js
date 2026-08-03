const mongoose = require('mongoose');
const async = require('async');

module.exports = (ctx) => {
  const { config, sender, stripe } = ctx;
  const { buildContinuityAuthQuery } = require('../lib/continuity_auth')(
    config
  );
  const Transaction = mongoose.model('Transaction');
  const Invoice = mongoose.model('Invoice');

  return {
    name: 'PendingStatusCheck',
    run: () =>
      new Promise((resolve) => {
        console.log('* * * * * Check Pending Status * * * * * ');
        let pendingTransactions = [];
        async.series(
          [
            (cb) => {
              Transaction.find({
                status: 'pending'
              })
                .populate('invoice')
                .exec((err, transactions) => {
                  if (err) {
                    cb(err);

                    return;
                  }
                  pendingTransactions = transactions;
                  cb();
                });
            },
            (cb) => {
              async.eachSeries(
                pendingTransactions,
                (transaction, callback) => {
                  if (
                    transaction.invoice &&
                    transaction.invoice.status == 'Pending'
                  ) {
                    let id;
                    if (transaction.transactionId !== '') {
                      id = transaction.transactionId;
                    } else {
                      id = transaction.paymentId;
                    }

                    // pi_xxx IDs come from PaymentIntents (new API); ch_xxx from legacy Charges API
                    const retrievePromise =
                      id && id.startsWith('pi_')
                        ? stripe.paymentIntents.retrieve(id).then((pi) => ({
                            status:
                              pi.status === 'processing'
                                ? 'pending'
                                : pi.status,
                            failure_code: pi.last_payment_error
                              ? pi.last_payment_error.code
                              : null
                          }))
                        : stripe.charges.retrieve(id).then((ch) => ({
                            status: ch.status,
                            failure_code: ch.failure_code
                          }));

                    const payout = retrievePromise;

                    payout
                      .then((res) => {
                        transaction.status = res.status;
                        transaction.save((err, transaction) => {
                          if (err) {
                            callback(err);

                            return;
                          }

                          if (transaction.invoice) {
                            Invoice.findOne({ _id: transaction.invoice })
                              .populate(
                                'findSpaceUserId listSpaceUserId project'
                              )
                              .exec((err, invoice) => {
                                if (err) {
                                  callback(err);

                                  return;
                                }
                                if (invoice) {
                                  const invoiceUpdate = {};
                                  if (transaction.status == 'failed') {
                                    invoiceUpdate.paymentStatus = `${res.status} [${res.failure_code}]`;
                                    invoiceUpdate.status = 'Payment Failed';
                                    invoiceUpdate.ticketGeneratedAutomaticallyForFailed = false;
                                    const operatorsBuyer =
                                      invoice.findSpaceUserId.additionalEmail
                                        .filter(
                                          (userObj) =>
                                            userObj.role.toLowerCase() ===
                                              'operator' &&
                                            userObj.notificationRoles.length ==
                                              0
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
                                            userObj.role.toLowerCase() ===
                                            'admin'
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
                                      projectNumber: invoice.project
                                        ? invoice.project.idNo
                                        : 'N/A',
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
                                  } else {
                                    if (res.status == 'succeeded') {
                                      invoiceUpdate.status =
                                        'Payment Succeeded';
                                      invoiceUpdate.paymentSucceededOn =
                                        new Date();
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
                                        invoiceNumber:
                                          invoice.globalInvoiceNumber
                                            ? invoice.globalInvoiceNumber
                                            : '0000',
                                        projectNumber: invoice.project
                                          ? invoice.project.idNo
                                          : 'N/A',
                                        url: config.url,
                                        logo:
                                          config.url +
                                          '/assets/images/logo.svg',
                                        toc: config.url + '/toc',
                                        privacy: config.url + '/privacy',
                                        continuity_url:
                                          config.url +
                                          '/buyer/all-invoices/' +
                                          invoice._id +
                                          buildContinuityAuthQuery(
                                            invoice.findSpaceUserId
                                              .businessEmail,
                                            invoice._id
                                          ),
                                        continuity_text: 'View Invoice',
                                        ticket_url:
                                          config.url +
                                          `/buyer/ticket/?redirect=true`
                                      };
                                      const operators =
                                        invoice.listSpaceUserId.additionalEmail
                                          .filter(
                                            (userObj) =>
                                              userObj.role.toLowerCase() ===
                                                'operator' &&
                                              userObj.notificationRoles
                                                .length == 0
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
                                              userObj.role.toLowerCase() ===
                                              'admin'
                                          )
                                          .map((userObj) => userObj.email);
                                      const operatorsBuyer =
                                        invoice.findSpaceUserId.additionalEmail
                                          .filter(
                                            (userObj) =>
                                              userObj.role.toLowerCase() ===
                                                'operator' &&
                                              userObj.notificationRoles
                                                .length == 0
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
                                              userObj.role.toLowerCase() ===
                                              'admin'
                                          )
                                          .map((userObj) => userObj.email);

                                      const providerLocals = {
                                        name: invoice.listSpaceUserId
                                          ? invoice.listSpaceUserId.firstName +
                                            ' ' +
                                            invoice.listSpaceUserId.lastName
                                          : '',
                                        invoiceNumber:
                                          invoice.globalInvoiceNumber
                                            ? invoice.globalInvoiceNumber
                                            : '0000',
                                        buyername: invoice.findSpaceUserId
                                          ? invoice.findSpaceUserId.firstName +
                                            ' ' +
                                            invoice.findSpaceUserId.lastName
                                          : '',
                                        projectNumber: invoice.project
                                          ? invoice.project.idNo
                                          : 'N/A',
                                        email:
                                          invoice.listSpaceUserId.businessEmail,
                                        url: config.url,
                                        logo:
                                          config.url +
                                          '/assets/images/logo.svg',
                                        toc: config.url + '/toc',
                                        privacy: config.url + '/privacy',
                                        continuity_url:
                                          config.url +
                                          '/provider/all-invoices/' +
                                          invoice._id +
                                          buildContinuityAuthQuery(
                                            invoice.listSpaceUserId
                                              .businessEmail,
                                            invoice._id
                                          ),
                                        continuity_text: 'View Invoice',
                                        ticket_url:
                                          config.url +
                                          `/provider/ticket/?redirect=true`
                                      };
                                      // To stop all notifications for end users (resumed later)
                                      sender.sendTemplateEmail(
                                        'invoice_succeeded',
                                        buyerLocals,
                                        invoice.findSpaceUserId.businessEmail,
                                        [
                                          ...operatorsBuyer,
                                          ...notificationOperatorsBuyer,
                                          ...invoicingBuyer,
                                          ...adminBuyer
                                        ],
                                        'Invoice has been cleared successfully'
                                      );
                                      // To stop all notifications for end users (resumed later)
                                      sender.sendTemplateEmail(
                                        'invoice_succeeded_howzer',
                                        providerLocals,
                                        invoice.listSpaceUserId.businessEmail,
                                        [
                                          ...operators,
                                          ...notificationOperators,
                                          ...invoicing,
                                          ...admin
                                        ],
                                        'Invoice has been cleared successfully'
                                      );
                                    }
                                    invoiceUpdate.paymentStatus = res.status;
                                  }

                                  // updateOne (not .save()) — avoids Mongoose's
                                  // full-document dirty-path scan, which can
                                  // stack-overflow on documents with large
                                  // array fields.
                                  Invoice.updateOne(
                                    { _id: invoice._id },
                                    { $set: invoiceUpdate },
                                    callback
                                  );
                                } else {
                                  callback();
                                }
                              });
                          } else {
                            callback();
                          }
                        });
                      })
                      .catch((err) => {
                        callback(err);
                      });
                  } else {
                    callback();
                  }
                },
                (err) => {
                  if (err) {
                    cb(err);

                    return;
                  }

                  cb();
                }
              );
            }
          ],
          (err) => {
            if (err) {
              console.log(
                err,
                '*********Error in invoice status update*********'
              );
            }
            resolve();
          }
        );
      })
  };
};
