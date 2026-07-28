const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StripeSchema = new Schema({
  accessToken: { type: String, default: '' },
  refreshToken: { type: String, default: '' },
  tokenType: { type: String, default: '' },
  authorizationCode: { type: String, default: '' },
  accountId: { type: String, default: '' },
  loginLink: { type: String, default: '' },
  stripe_user_id: { type: String, default: '' },
  listSpaceUserId: {
    type: Schema.ObjectId,
    ref: 'ListSpaceUser',
    default: null
  },
  findSpaceUserId: {
    type: Schema.ObjectId,
    ref: 'FindSpaceUser',
    default: null
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  delete: { type: Boolean, default: false }
});

mongoose.model('Stripe', StripeSchema);
