import mongoose from "mongoose";
import { logger } from "../lib/logger.js";

let connected = false;

export async function connectDb(uri = process.env.MONGODB_URI) {
  if (connected) return mongoose.connection;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  connected = true;
  logger.info("mongodb_connected", { host: mongoose.connection.host });
  return mongoose.connection;
}

export function isDbConnected() {
  return connected && mongoose.connection.readyState === 1;
}
