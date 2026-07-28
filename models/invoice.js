const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const InvoiceSchema = new Schema({
  invoiceNumber: { type: Number, default: 0 },
  invoiceDate: { type: Date, default: Date.now },
  paymentDue: { type: Date, default: Date.now },
  invoicePeriod: { type: Date, default: Date.now },
  total: { type: Number, default: 0 },
  clientFee: { type: Number, default: 0 },
  shipperServiceFee: { type: Number, default: 0 },
  surcharge: { type: Number, default: 0 },
  due: { type: Number, default: 0 },
  transactionId: { type: String, default: '' },
  companyInvoiceID: { type: String, default: '' },
  clientId: { type: String, default: '' },
  globalInvoiceNumber: { type: String, default: '' },
  storage: [
    {
      service: { type: String, default: '' },
      rate: { type: Number, default: 0 },
      volume: { type: Number, default: 0 },
      charge: { type: Number, default: 0 }
    }
  ],
  services: [
    {
      service: { type: String, default: '' },
      rate: { type: Number, default: 0 },
      volume: { type: Number, default: 0 },
      charge: { type: Number, default: 0 },
      unit: { type: String, default: '' }
    }
  ],
  project: { type: Schema.ObjectId, ref: 'Project', default: null },
  listing: { type: Schema.ObjectId, ref: 'Listings', default: null },
  createdAt: { type: Date, default: Date.now },
  delete: { type: Boolean, default: false },
  status: {
    type: String,
    enum: [
      'Draft',
      'Revision',
      'Alternative Payment',
      'Released',
      'Pending',
      'Payment Succeeded',
      'Invoice Disputed',
      'Payment Disputed',
      'Payment Failed',
      'Payment Completed',
      'Payment InComplete',
      'Cancelled',
      'Urgent'
    ],
    default: 'Draft'
  },
  paymentStatus: { type: String, default: '' },
  revisionHistory: [
    {
      index: { type: Number },
      message: { type: String, default: '' }
    }
  ],
  description: [
    {
      index: { type: Number },
      message: { type: String, default: '' }
    }
  ],
  disputeNote: { type: String, default: '' },
  disputeHistory: {
    disputeCount: { type: Number, default: 0 },
    date: { type: Date, default: null },
    reSubmittedDate: { type: Date, default: null },
    reSubmitted: { type: Boolean, default: false }
  },
  failedHistory: {
    date: { type: Date, default: null }, // Initial/first date on which an invoice failed.
    failedCount: { type: Number, default: 0 }, // Number of times the payment had failed.
    reSubmitted: { type: Boolean, default: false }, // If failed invoice is resubmitted.
    reSubmittedDate: { type: Date, default: null } // Date when invoice is resubmitted
  },
  readStatusProvider: { type: Boolean, default: true },
  readStatusBuyer: { type: Boolean, default: false },
  attachment: [{ type: Schema.ObjectId, ref: 'FileMeta', default: null }],
  listSpaceUserId: { type: Schema.ObjectId, ref: 'ListSpaceUser' },
  findSpaceUserId: { type: Schema.ObjectId, ref: 'FindSpaceUser' },
  processDates: [{ type: Date }],
  invoice_failed_buyer: { type: Boolean, default: false },
  ticketGeneratedAutomaticallyForDispute: { type: Boolean, default: false },
  ticketGeneratedAutomaticallyForFailed: { type: Boolean, default: false },
  paymentSucceededOn: { type: Date, default: null },
  approvedByBuyer: { type: Boolean, default: false },
  hiddenByManager: { type: Boolean, default: false }
});
mongoose.model('Invoice', InvoiceSchema);
