const mongoose = require('mongoose');

const ROLES = ['admin', 'instructor', 'learner'];

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // never return password hash by default
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'learner',
      required: true,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  }
);

module.exports = mongoose.model('User', userSchema);
module.exports.ROLES = ROLES;
