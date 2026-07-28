const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const projectSchema = new Schema({
  listId: { type: Schema.ObjectId, ref: 'Listings', default: null },
  assignedListings: [{ type: Schema.ObjectId, ref: 'Listings', default: null }],
  removedListingsAfter24Hours: [
    { type: Schema.ObjectId, ref: 'Listings', default: null }
  ],
  readStatus: [{ type: Schema.ObjectId, ref: 'ListSpaceUser', default: null }],
  assignedStatus: { type: Boolean, default: false },
  idNo: String,
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
  listing: { type: Schema.ObjectId, ref: 'Listings', default: null },
  firstShipmentArrive: { type: Date, default: null },
  fromDate: { type: Date, default: null },
  toDate: { type: Date, default: null },
  place: { type: String, default: '' },
  zipcode: { type: String, default: null },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  productDimensions: {
    height: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    depth: { type: Number, default: 0 }
  },
  searchParameter: {
    type: String,
    enum: ['cityState', 'region', 'city', 'state'],
    default: 'cityState'
  },
  region: { type: String, default: '' },
  space: {
    space: { type: Number, default: null },
    unit: { type: String, default: '' },
    boxes: {
      length: { type: String, default: '' },
      lengthUnit: { type: String, default: '' },
      width: { type: String, default: '' },
      widthUnit: { type: String, default: '' },
      height: { type: String, default: '' },
      heightUnit: { type: String, default: '' }
    }
  },
  kindsOfProducts: { type: String, default: null },
  skus: { type: String, default: null },
  skusType: { type: String, default: null },
  productsArrivalTransport: [{ type: String, default: null }],
  productsArrivalPacking: { type: String, default: null },
  productsArrivalPackingType: [{ type: String, default: '' }],
  palletSize: { type: String, default: '' },
  itemsPerPallet: { type: Number, default: 0 },
  productsLeaveTransport: { type: String, default: null },
  outboundMode: [{ type: String, default: null }],
  specialisedStorageTypes: [{ type: String, default: null }],
  valueAddedServices: [{ type: String, default: null }],
  bestOpportunity: [{ type: String, default: null }],
  productStoredAs: [{ type: String, default: null }],
  monthlyOrder: {
    inboundOrder: { type: Number, default: null },
    outboundOrder: { type: Number, default: null },
    averageNumberInOutboundOrder: { type: Number, default: null },
    SKUperOrder: { type: Number, default: null }
  },
  monthlyStorage: {
    capacity: { type: Number, default: null },
    unitsOfpallet: { type: String, default: '' },
    palletWeight: { type: Number, default: null },
    palletLength: { type: Number, default: null },
    palletWidth: { type: Number, default: null },
    palletHeight: { type: Number, default: null },
    palletStacking: { type: String, default: '' },
    palletSizeForPallet: { type: String, default: '' }
  },
  expectedShipmentFrequency: {
    perDay: { type: Number, default: null },
    perWeek: { type: Number, default: null }
  },
  businessEmail: { type: String, default: '' },
  firstMailSent: { type: Boolean, default: false },
  message: { type: String, default: '' },
  estimate: { type: String, default: '' },
  newEstimate: { type: String, default: '' },
  operate: { type: String, default: '' },
  shipOutTime: { type: String, default: '' },
  stacked: { type: String, default: '' },
  collect: { type: String, default: '' },
  orderProcess: { type: String, default: '' },
  averageSize: { type: Number, default: '' },
  averageSizeUnit: { type: String, default: '' },
  description: { type: String, default: '' },
  delete: { type: Boolean, default: false },
  palletized: { type: Boolean },
  numberOfPallets: { type: Number, default: null },
  previousStatus: { type: String, default: '' },
  status: {
    type: String,
    enum: [
      'Initiation',
      'Draft',
      'Published',
      'Proposal',
      'Pending',
      'Started',
      'Ended',
      'Canceled',
      'Rejected',
      'Negotiating',
      'Active',
      'Completed',
      'Quote Requested',
      'Expired',
      'Inactive',
      'Renew',
      'Trial'
    ],
    default: 'Draft'
  },
  projectStatus: { type: String, default: '' },
  projectStatusProvider: [
    { type: Schema.ObjectId, ref: 'ListSpaceUser', default: null }
  ],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  submittedAt: { type: Date, default: Date.now },
  publishedAt: { type: Date, default: null },
  createdBy: { type: String, enum: ['Manager', 'Buyer'], default: 'Buyer' },
  quotes: [{ type: Schema.ObjectId, ref: 'Quotes', default: null }],
  draftQuotes: [{ type: Schema.ObjectId, ref: 'DraftQuotes', default: null }],
  quote_accepted: { type: Schema.ObjectId, ref: 'Quotes', default: null },
  warehouseOperatingTimings: [{ type: String, default: '' }],
  photos: [
    {
      original: { type: Schema.ObjectId, ref: 'FileMeta' },
      thumb: { type: Schema.ObjectId, ref: 'FileMeta' },
      description: { type: String, default: '' }
    }
  ],
  project_type: {
    type: String,
    enum: [
      'Storage or Cross-Docking',
      'Storage + B2B Fulfillment',
      'Storage + B2C Fulfillment',
      'Other',
      'Storage',
      'Fulfillment'
    ],
    default: 'Storage'
  },

  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  companyName: { type: String, default: '' },
  managers_note: { type: String, default: '' },
  map: {
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    }
  },
  createdWithSplitPathWorkflow: {
    type: Boolean,
    default: false
  },
  ownerNotifiedAboutQuoteRequestsAfterFourHours: {
    type: Boolean,
    default: false
  },
  ownerNotifiedAboutWarehouseSelectionAfterFourHours: {
    type: Boolean,
    default: false
  },
  ownerNotifiedAboutQuotesRecievedAfterSixteenHours: {
    type: Boolean,
    default: false
  },
  teamNotifiedAboutLessThanSevenWarehowses: { type: Boolean, default: false },
  teamNotifiedAboutDepozitorEncounteredRateScreen: {
    type: Boolean,
    default: false
  },
  ownerNotifiedAboutQuoteReceived: { type: Boolean, default: false },
  projectStage: {
    type: String,
    enum: [
      'Project Spec Created',
      'Quote Requested',
      'Quote Delivered',
      'Quote Returned',
      'Warehouse Selected',
      'Contract Sent',
      'Contract Signed',
      'N/A',
      'Canceled'
    ],
    default: 'N/A'
  },
  matchedListingsCount: { type: Number, default: 0 },
  matchedListings: [
    {
      listing: { type: Schema.ObjectId, ref: 'Listings', default: null },
      selectedToAssign: { type: Boolean, default: true }
    }
  ],
  matchedAt: { type: Date, default: null },
  showQuotesAfter24Hour: { type: Boolean, default: false },
  salesTeamNotifiedAboutQuoteDeliveredStage: { type: Boolean, default: false },
  salesTeamNotifiedAboutWarehouseSelectedStage: {
    type: Boolean,
    default: false
  },
  matchedTimeInSeconds: { type: Number, default: 0 },
  addedToQueueAt: { type: Date, default: null },
  inQueueUptimeInSeconds: { type: Number, default: 0 },
  uptimeAsQuoteDeliveredStage: { type: Number, default: 0 },
  uptimeAsWarehouseSelectedStage: { type: Number, default: 0 },
  timeLeftInQueue: {
    h: { type: Number, default: -1 },
    m: { type: Number, default: -1 },
    s: { type: Number, default: -1 }
  },
  timeLeftAsQuoteDeliveredStage: {
    h: { type: Number, default: -1 },
    m: { type: Number, default: -1 },
    s: { type: Number, default: -1 }
  },
  timeLeftAsWarehouseSelectedStage: {
    h: { type: Number, default: -1 },
    m: { type: Number, default: -1 },
    s: { type: Number, default: -1 }
  },
  inQueue: { type: Boolean, default: false },
  flaggedByManager: { type: Boolean, default: false },
  removedFromQueue: { type: Boolean, default: false },
  cancelNotes: { type: String, default: '' },
  managerCancelNotes: { type: String, default: '' },
  cartonDimensions: {
    length: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 }
  },
  otherDimensions: {
    length: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    weight: { type: Number, default: 0 },
    noOfItems: { type: Number, default: 0 }
  },
  estimatedNumberOfCartons: { type: Number, default: null },
  estimatedWeightOfEachCartons: { type: Number, default: null },
  estimatedNumberOfItems: { type: Number, default: null },
  estimatedWeightOfEachItem: { type: Number, default: null },
  containsHazardousMaterials: { type: Boolean, default: false },
  requiresTCorFrozenStorage: { type: Boolean, default: false },
  hazmatValue: {
    type: String,
    // enum: ['Class 1 Explosives', 'Class 2 Compresses gases', 'Class 3 Flammable and combustible liquid', 'Class 4 Flammable and reactive solids', 'Class 5 Oxidizers and organic peroxides', 'Class 6 Poisonous/Toxic materials', 'Class 7 Radioactive material', 'Class 8 Corrosive material', 'Class 9 Miscellaneous hazardous material', 'Other Regulated Material: ORM-D', 'N/A']
    default: null
  },
  frozenStorageValue: { type: Number, default: null },
  projectCopiedFrom: { type: Schema.ObjectId, ref: 'Project', default: null },
  warehouseSelectedSince: { type: Number, default: 0 },
  warehouseSelected: { type: Boolean, default: false },
  paymentMode: {
    type: String,
    enum: ['Each Quote', 'Lifetime', 'N/S'],
    default: 'N/S'
  },
  howzerToBeNotifiedAboutInvoiceEmail: { type: Boolean, default: false },
  inventoryFrequency: {
    type: String,
    enum: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'N/A'],
    default: 'N/A'
  },
  howManyOrdersInSelectedFrequency: { type: Number, default: null },
  firstQuoteReceivedAt: { type: Date, default: null },
  warehouseSelectedAt: { type: Date, default: null },
  projectExpectations: { type: String, default: '' },
  spaceRequiredOnTheBasisOf: { type: String, default: '' },
  dataIntegrationRequired: { type: Boolean, default: true },

  integrations: [{ type: String, default: '' }],
  otherIntegration: [{ type: String, default: '' }],
  temperatureRequirements: { type: String, default: '' },
  rangeForColdStorage: {
    min: { type: Number, default: null },
    max: { type: Number, default: null },
    unit: { type: String, default: 'F' }
  },
  specialityRequirements: {
    required: { type: Boolean, default: true },
    requirements: [{ type: String, default: '' }]
  },
  estimatedBudget: { type: String, default: null },
  incomingOrdersCommunicationModes: {
    modes: [{ type: String, default: '' }],
    customMode: { type: String, default: '' }
  },
  customerOrdersCommunicationModes: {
    defaultOptions: [{ type: String, default: '' }],
    customOption: { type: String, default: '' }
  },
  allInventoryOnPallets: { type: Boolean, default: true },
  inboundPackingType: {
    defaultOptions: [{ type: String, default: '' }],
    customOption: { type: String, default: '' }
  },
  inboundShipmentFrequency: {
    type: String,
    enum: ['Weekly', 'Monthly', 'Bi-monthly', 'N/A'],
    default: 'N/A'
  },
  specialReceivingRequirements: { type: String, default: '' },
  itemsStoredAs: [{ type: String, default: '' }],
  palletsStackingType: [{ type: String, default: '' }],
  flooredStackingType: [{ type: String, default: '' }],
  rackedStackable: [{ type: String, default: '' }],
  nonPalletsStackingNumber: { type: Number, default: null },
  typeAndVolumeOfPackaging: [{ type: String, default: '' }],
  typeAndVolumeOfPackagingOtherItem: { type: String, default: '' },
  fulfillmentRequirements: {
    provideOwnPackaging: { type: Boolean, default: false },
    provideShippingLabels: { type: Boolean, default: false },
    kittingRequired: { type: Boolean, default: false },
    additional: { type: String, default: '' }
  },
  shipOverweightOrOversizedCartons: { type: Boolean, default: false },
  outboundShipping: {
    own: { type: Boolean, default: false },
    preferredCarrier: {
      defaultOption: { type: String, default: '' },
      customOption: { type: String, default: '' }
    },
    shippingAccount: { type: String, default: '' },
    customerDeliveryRequirements: [{ type: String, default: '' }],
    returnsNeeded: { type: Boolean, default: false }
  },
  completionPercentage: { type: Number, default: 0 },
  uploadedCSV: { type: Schema.ObjectId, ref: 'FileMeta', default: null },
  reasonForWarehowz: [{ type: String, default: '' }],
  tosAcceptanceProvider: [{ type: String, default: '' }],
  tosAcceptanceBuyer: [{ type: String, default: '' }],
  paymentReviewTimeInDays: { type: Number, default: 15 },
  closedAsInactiveProject: { type: Boolean, default: false },
  productWithdraw: {
    once: { type: Boolean, default: false },
    productCount: { type: Number },
    occurance: { type: String }
  },
  renew: {
    renewed: { type: Boolean, default: false },
    buyerView: { type: Boolean, default: false },
    providerView: { type: Boolean, default: false },
    buyerAccepted: { type: Boolean, default: null },
    providerAccepted: { type: Boolean, default: null }
  },
  extendedByBuyer: { type: Boolean, default: false },
  extensionDetails: {
    selectedDaysByBuyer: { type: String, default: '' },
    newEndDateByBuyer: { type: Date, default: null }
  },
  isDeclined: { type: Schema.Types.Mixed, default: {} }
});
// IF YOU ARE ADDING A NEW KEY HERE PLEASE CHECK IN THE FILES app\controllers\clone_and_create_new_project.js & app\controllers\manager\changeProjectStatusToDraft.js AND UPDATE THE KEY THERE IF REQUIRED
mongoose.model('Project', projectSchema);
