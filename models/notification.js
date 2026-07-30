const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const notificationSchema = new Schema({
  templateName: { type: String, default: '' },
  from: { type: String, default: '' },
  recipient: { type: String, default: '' },
  cc: { type: String, default: '' },
  subject: { type: String, default: '' },
  locals: { type: Schema.Types.Mixed, default: {} },
  isEmailSent: { type: Boolean, default: false },
  sentAt: { type: Date, default: null },
  error: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});

mongoose.model('Notification', notificationSchema);
