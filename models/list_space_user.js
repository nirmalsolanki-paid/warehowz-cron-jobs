const mongoose = require('mongoose');
const crypto = require('crypto');
const Schema = mongoose.Schema;

const ListSpaceUserSchema = new Schema({
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  fullName: { type: String, default: '' },
  address: { type: String, default: '' },
  businessEmail: { type: String, default: '' },
  addressPlace: {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },
    zip: { type: String, default: '' },
    lat: { type: String, default: '' },
    lng: { type: String, default: '' }
  },
  emailVerified: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false },
  pushMailNotification: { type: Boolean, default: true },
  hashed_password: { type: String, default: '' },
  registeredWithPassword: { type: Boolean, default: false },
  salt: { type: String, default: '' },
  timeZone: { type: String, default: '' },
  companyName: { type: String, default: '' },
  multipleEmail: [{ type: String, default: '' }],
  multiplePhone: [{ type: String, default: '' }],
  additionalEmail: [
    {
      firstName: { type: String, default: '' },
      lastName: { type: String, default: '' },
      email: { type: String, default: '' },
      role: { type: String, default: '' },
      notificationRoles: [{ type: String, default: '' }],
      verify: { type: Boolean, default: 'false' },
      tokenVerify: { type: Boolean, default: 'false' },
      hashed_password: { type: String, default: '' },
      salt: { type: String, default: '' },
      createdAt: { type: Date, default: Date.now }
    }
  ],
  project_choice: [{ type: String, default: '' }],
  userName: { type: String, default: '' },
  website: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  fax: { type: String, default: '' },
  address1: { type: String, default: '' },
  address2: { type: String, default: '' },
  city: { type: String, default: '' },
  state: { type: String, default: '' },
  zipCode: { type: String, default: '' },
  country: { type: String, default: '' },
  delete: { type: Boolean, default: false },
  type: { type: String, default: 'provider' },
  attachment: { type: Schema.ObjectId, ref: 'FileMeta', default: null },
  tokenVerify: { type: Boolean, default: 'false' },
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  imagepic: { type: Schema.ObjectId, ref: 'FileMeta', default: null },
  // listSpaceId : {type : Schema.ObjectId,ref :'ListSpace'}
  signup_reminder_mail_provider: { type: Boolean, default: false },
  user_acc_type: {
    type: String,
    enum: ['default', '3pl', 'estes', 'efw', 'chrobinson', 'kuebix', 'gclid'],
    default: 'default'
  },
  gclid: { type: String, default: '' },
  invoiceSubmittedToday: {
    date: { type: Date, default: null },
    invoices: [{ type: Schema.ObjectId, ref: 'Invoice', default: null }]
  },
  managerNotes: { type: String, default: '' },
  signedInfo: {
    creationEmail: { type: String, default: '' },
    creationDate: { type: Date, default: null }
  },
  isFirstUser: { type: Boolean, default: true },
  isFirstTime: { type: Boolean, default: true },
  emailVerificationToken: { type: String, default: '' },
  emailVerificationTokenExpires: { type: Date, default: null },
  howzerServiceFee: { type: Number, default: 5 },
  shipperServiceFee: { type: Number, default: 5 },
  isSocialLogin: { type: Boolean, default: false }
});

ListSpaceUserSchema.virtual('date').get(() => this._id.getTimestamp());

ListSpaceUserSchema.virtual('password').set(function (password) {
  this.salt = this.makeSalt();
  this.hashed_password = this.encryptPassword(password);
});

ListSpaceUserSchema.methods = {
  authenticate: function (plainText) {
    return this.encryptPassword(plainText) === this.hashed_password;
  },
  add_authenticate: function (username, plainText) {
    for (let i = 0; i < this.additionalEmail.length; i++) {
      if (this.additionalEmail[i].email == username) {
        return (
          this.add_encryptPassword(this.additionalEmail[i].salt, plainText) ===
          this.additionalEmail[i].hashed_password
        );
      }
    }
  },
  impersonate: function (plainText) {
    return plainText === require('../../config/config').impersonationKey;
  },

  makeSalt: function () {
    return Math.round(new Date().valueOf() * Math.random()) + '';
  },

  encryptPassword: function (password) {
    if (!password) {
      return '';
    }

    return crypto.createHmac('sha1', this.salt).update(password).digest('hex');
  },
  add_encryptPassword: function (salt, password) {
    if (!password) {
      return '';
    }

    return crypto.createHmac('sha1', salt).update(password).digest('hex');
  }
};

mongoose.model('ListSpaceUser', ListSpaceUserSchema);
