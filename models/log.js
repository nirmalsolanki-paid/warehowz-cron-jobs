const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const LogSchema = new Schema({
  findSpaceUserId: { type: Schema.ObjectId, ref: 'FindSpaceUser' },
  listSpaceUserId: { type: Schema.ObjectId, ref: 'ListSpaceUser' },
  invoiceId: { type: Schema.ObjectId, ref: 'Invoice', default: null },
  message: { type: String, default: '' },
  code: { type: String, default: '' },
  declineCode: { type: String, default: '' },
  type: { type: String, default: '' },
  requestId: { type: String, default: '' },
  url: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

LogSchema.pre('save', (next) => {
  this.updatedAt = new Date();
  next();
});

mongoose.model('Log', LogSchema);
