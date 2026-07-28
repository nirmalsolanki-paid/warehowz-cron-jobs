const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const QuotesSchema = new Schema({
  quoteId: { type: String },
  listId: { type: Schema.ObjectId, ref: 'Listings', default: null },
  projectId: { type: Schema.ObjectId, ref: 'Project', default: null },
  clientName: { type: String, default: '' },
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
  assignedWarehouse: { type: String, default: '' },

  readStatusListSpaceUser: { type: Boolean, default: false },
  readStatusFindSpaceUser: { type: Boolean, default: false },
  isFiles: { type: Boolean, default: false },
  isEdited: { type: Boolean, default: false },

  note: { type: String, default: '' },
  delete: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  attachedFiles: [{ type: Schema.ObjectId, ref: 'FileMeta', default: null }],
  cancel_note: { type: String, default: '' },
  accepted: { type: Boolean, default: false },
  notified_quote_accepted: { type: Boolean, default: false },
  notified_quote_rejected: { type: Boolean, default: false },
  servicesList: [
    {
      serviceName: { type: String, default: '' },
      rate: { type: String, default: '' },
      unit: { type: String, default: '' }
    }
  ],
  reasonForNotQuoting: {
    reason: { type: String, default: '' },
    otherReason: { type: String, default: '' }
  },
  mannualContract: { type: Schema.ObjectId, ref: 'FileMeta', default: null },
  filePath: { type: String, default: '' },
  declined_by_buyer: { type: Boolean, default: false },
  quoteVisibleToHowzerByManager: { type: Boolean, default: false },
  transport_service: { type: Boolean, default: false }
});
mongoose.model('Quotes', QuotesSchema);
