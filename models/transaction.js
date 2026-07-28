const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
  findSpaceUserId: { type: Schema.ObjectId, ref: 'FindSpaceUserId' },
  listSpaceUserId: { type: Schema.ObjectId, ref: 'ListSpaceUserId' },
  invoice: { type: Schema.ObjectId, ref: 'Invoice' },
  transactionId: { type: String, default: '' },
  destination: { type: String, default: '' },
  transferId: { type: String, default: '' },
  payout: { type: String, default: '' },
  amount: { type: Number, default: 0 },
  payoutAmount: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
  refunded: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now },
  paidDate: { type: Date, default: Date.now },
  balance_transaction: { type: String, default: '' },
  paymentId: { type: String, default: '' },
  receipt_url: { type: String, default: '' },
  currency: { type: String, default: '' },
  type: { type: String, default: '' },
  status: { type: String, default: 'Not Paid' },
  customerId: { type: String, default: '' }
});

TransactionSchema.pre('save', (next) => {
  this.updatedAt = new Date();
  next();
});

mongoose.model('Transaction', TransactionSchema);
