const mongoose = require('mongoose');

// Daily analytics summaries archived out of the raw UsageEvent collection.
// Previously stored as JSON files in S3; now lives in MongoDB so all
// storage stays in the app's own database.
const analyticsArchiveSchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true }, // YYYY-MM-DD
    summary: { type: mongoose.Schema.Types.Mixed, required: true },
    archivedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('AnalyticsArchive', analyticsArchiveSchema);
