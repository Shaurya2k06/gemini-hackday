import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    rawQuery: {
      type: String,
      default: "",
    },
    structured: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    constraintMode: {
      type: String,
      enum: ["heavy", "lite"],
      default: "heavy",
    },
    companies: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    cards: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    customColumns: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    message: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

chatSchema.index({ userId: 1, updatedAt: -1 });

export const Chat = mongoose.models.Chat || mongoose.model("Chat", chatSchema);
