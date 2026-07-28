const mongoose = require('mongoose');
const crypto = require('crypto');
const Schema = mongoose.Schema;

const FindSpaceUserSchema = new Schema({
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  fullName: { type: String, default: '' },
  address: { type: String, default: '' },
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
  firstLetters: { type: String, default: '' },
  color: String,
  businessEmail: { type: String, default: '' },
  emailVerified: { type: Boolean, default: false },
  isLoggedIn: { type: Boolean, default: false },
  pushMailNotification: { type: Boolean, default: true },
  hashed_password: { type: String, default: '' },
  registeredWithPassword: { type: Boolean, default: false },
  salt: { type: String, default: '' },
  userName: { type: String, default: '' },
  timeZone: { type: String, default: '' },
  companyName: { type: String, default: '' },
  website: { type: String, default: '' },
  phoneNumber: { type: String, default: '' },
  delete: { type: Boolean, default: false },
  type: { type: String, default: 'buyer' },
  tokenVerify: { type: Boolean, default: 'false' },
  promoCode: { type: String, default: '' },
  attachment: { type: Schema.ObjectId, ref: 'FileMeta', default: null },
  facilities: { type: String, default: '' },
  multipleEmail: [{ type: String, default: '' }],
  multiplePhone: [{ type: String, default: '' }],
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
  imagepic: { type: Schema.ObjectId, ref: 'FileMeta', default: null },
  signup_reminder_mail_buyer: { type: Boolean, default: false },
  user_acc_type: { type: String, default: '' },
  gclid: { type: String, default: '' },
  notifiedAboutProjectCreationAfterFourHours: { type: Boolean, default: false },
  givenFeedback: { type: Schema.ObjectId, ref: 'UserFeedback', default: null },
  paymentReviewTimeInDays: { type: Number, default: 15 },
  managerNotes: { type: String, default: '' },
  signedInfo: {
    creationEmail: { type: String, default: '' },
    creationDate: { type: Date, default: null }
  },
  emailVerificationToken: { type: String, default: '' },
  emailVerificationTokenExpires: { type: Date, default: null },
  isSocialLogin: { type: Boolean, default: false }
});

FindSpaceUserSchema.virtual('date').get(() => this._id.getTimestamp());

FindSpaceUserSchema.virtual('password').set(function (password) {
  this.salt = this.makeSalt();
  this.hashed_password = this.encryptPassword(password);
});

FindSpaceUserSchema.methods = {
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

function firstLetters(string) {
  var str = string; //"Java Script Object Notation"
  var matches = str.match(/\b(\w)/g); // ['J','S','O','N']
  var a = matches.join('')[0] ? matches.join('')[0] : '';
  var b = matches.join('')[1] ? matches.join('')[1] : '';
  var acronym = a + b;

  return acronym;
}

function getRandomColor() {
  var letters = '0123456789ABCDEF';
  var color = '#';
  for (var i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }

  return color;
}

FindSpaceUserSchema.pre('save', function (next) {
  if (this.companyName) {
    this.firstLetters = firstLetters(this.companyName);
    this.color = getRandomColor();
    next();
  } else {
    next();
  }
});

mongoose.model('FindSpaceUser', FindSpaceUserSchema);
