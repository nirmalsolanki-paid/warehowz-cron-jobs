const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ticketSchema = new Schema({
  ticketId: { type: String, default: '' },
  projectId: { type: Schema.ObjectId, ref: 'Project', default: null },
  listingId: { type: Schema.ObjectId, ref: 'Listings', default: null },
  createdAt: { type: Date, default: Date.now },
  updateddAt: { type: Date, default: Date.now },
  issueType: { type: String, default: '' },
  withRespectTo: { type: String, default: '' },
  issueWith: { type: String, default: '' },
  closedOn: { type: Date },
  status: {
    type: String,
    enum: ['In Progress', 'Closed', 'Canceled', 'New'],
    default: 'In Progress'
  },
  raisedVia: {
    type: String,
    enum: ['Email Help Button', 'App'],
    default: 'App'
  },
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
  description: { type: String, default: '' },
  attachedFiles: [{ type: Schema.ObjectId, ref: 'FileMeta', default: null }],
  isFiles: { type: Boolean, default: false },
  readStatus: { type: Boolean, default: false },
  phoneNumberBuyer: { type: String, default: '' },
  phoneNumberProvider: { type: String, default: '' },
  createdByBuyer: {
    type: Schema.ObjectId,
    ref: 'FindSpaceUser',
    default: null
  },
  createdByProvider: {
    type: Schema.ObjectId,
    ref: 'ListSpaceUser',
    default: null
  },
  teamMemberAssigned: {
    type: Schema.ObjectId,
    ref: 'User',
    default: null
  },
  terminationReason: {
    type: String,
    default: 'Not Specified'
  },
  terminatedBy: {
    type: Schema.ObjectId,
    refPath: 'terminationAllowedFor'
  },
  terminationAllowedFor: {
    type: String,
    enum: ['User', 'ListSpaceUser', 'FindSpaceUser']
  },
  automaticallyCreated: {
    type: Boolean,
    default: false
  }
});
mongoose.model('Ticket', ticketSchema);
