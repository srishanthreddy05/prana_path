const mongoose = require("mongoose");

const policeLocationSchema = new mongoose.Schema({
  policeId: {
    type: String, // socket room or user id
    required: true,
  },
  lat: Number,
  lng: Number,
  radius: {
    type: Number,
    default: 50, // meters
  },
  isActive: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model("PoliceLocation", policeLocationSchema);
