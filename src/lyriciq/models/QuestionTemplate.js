'use strict';

const mongoose = require('mongoose');

/** Question templates are code-defined but mirrored here so they can be toggled without a deploy. */
const questionTemplateSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    skill: { type: String, enum: ['RECALL', 'RECOGNITION'], required: true },
    answerTypes: { type: [String], default: ['MULTIPLE_CHOICE'] },
    enabled: { type: Boolean, default: true },
    baseDifficulty: { type: Number, default: 30, min: 0, max: 100 },
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
    version: { type: Number, default: 1 }
}, { timestamps: true });

module.exports = mongoose.models.QuestionTemplate || mongoose.model('QuestionTemplate', questionTemplateSchema);
