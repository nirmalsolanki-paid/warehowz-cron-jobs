const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SettingsSchema = new Schema(
  {
    enableCronJobService: { type: Boolean, default: false }
  },
  { timestamps: true }
);

mongoose.model('Settings', SettingsSchema);
