const mongoose = require('mongoose');

const FoodSafetyNCSchema = new mongoose.Schema({
  unit: { type: String, required: true },
  specificLocation: { type: String },
  description: { type: String, required: true },
  priority: { type: String, enum: ['Normal', 'Urgent'], default: 'Normal' },
  photo: { type: String }, // file path or URL
  reportedBy: { type: String, required: true },
  status: { type: String, enum: ['Open', 'Resolved'], default: 'Open' },
  resolution: {
    resolver: String,
    notes: String,
    photo: String, // file path or URL
    resolvedAt: Date
  }
}, { timestamps: true });

module.exports = mongoose.model('FoodSafetyNC', FoodSafetyNCSchema);
