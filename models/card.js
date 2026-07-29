const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CardSchema = new Schema({
  stripeToken: { type: String, default: '' },
  stripeTokenType: { type: String, default: '' },
  stripeBankAccountToken: { type: String, default: '' },
  accessToken: { type: String, default: '' },
  defaultSource: { type: String, default: '' },
  stripeEmail: { type: String, default: '' },
  customerId: { type: String, default: '' },
  itemId: { type: String, default: '' },
  balance: { type: Number, default: 0 },
  email: { type: String, default: '' },
  cardId: { type: String, default: '' },
  acc_last4: { type: String, default: '' },
  name: { type: String, default: '' },
  bank_account: {
    account_id: { type: String, default: '' },
    accountHolderName: { type: String, default: '' },
    accountType: { type: String, default: '' },
    routingNumber: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    bankName: { type: String, default: '' },
    status: { type: String, default: '' }
  },
  accountId: { type: String, default: '' },
  type: { type: String, enum: ['card', 'ach', 'bank_account'] },
  accountType: { type: String, enum: ['manager', 'provider', 'buyer'] },
  findSpaceUserId: {
    type: Schema.ObjectId,
    ref: 'FindSpaceUser',
    default: null
  },
  listSpaceUserId: {
    type: Schema.ObjectId,
    ref: 'ListSpaceUser',
    default: null
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['Created', 'Updated', 'Released', 'Verified'],
    default: 'Created'
  },
  delete: { type: Boolean, default: false },
  cardBrand: { type: String, default: '' },
  cardExpMonth: { type: Number, default: null },
  cardExpYear: { type: Number, default: null },
  paymentMethodId: { type: String, default: '' },
  setupIntentId: { type: String, default: '' },
  mandateId: { type: String, default: '' },
  microdepositType: { type: String, default: 'amounts' }
});

mongoose.model('Card', CardSchema);
