const mongoose = require('mongoose');

const COURSE_STATUSES = ['draft', 'published', 'archived'];

const courseSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 5000 },

    // Keep the existing public contract from openapi.json (tags + createdBy),
    // while also adding fields from the schema doc (status, publishedAt, deletedAt, updatedBy).
    status: {
      type: String,
      enum: COURSE_STATUSES,
      default: 'draft',
      required: true,
      index: true,
    },

    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length <= 50 &&
          arr.every((t) => typeof t === 'string' && t.trim().length > 0 && t.length <= 50),
        message: 'tags must be an array of non-empty strings (max 50 tags, max 50 chars each)',
      },
    },

    publishedAt: { type: Date, default: null, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true }
);

// Helpful indexes for listing/pagination.
courseSchema.index({ status: 1, publishedAt: -1 });
courseSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Course', courseSchema);
module.exports.COURSE_STATUSES = COURSE_STATUSES;
