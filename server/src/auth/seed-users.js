import bcrypt from "bcryptjs";
import { User } from "./models/User.js";
import { DEMO_USERS } from "./demo-credentials.js";
import { logger } from "../lib/logger.js";

const SALT_ROUNDS = 10;

/**
 * Upsert the 10 demo accounts. Existing users keep their passwordHash
 * unless FORCE_RESEED_DEMO_USERS=true.
 */
export async function seedDemoUsers() {
  const force = String(process.env.FORCE_RESEED_DEMO_USERS ?? "").toLowerCase() === "true";
  let created = 0;
  let updated = 0;

  for (const { username, password } of DEMO_USERS) {
    const existing = await User.findOne({ username });
    if (existing && !force) continue;

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    if (existing) {
      existing.passwordHash = passwordHash;
      await existing.save();
      updated += 1;
    } else {
      await User.create({ username, passwordHash });
      created += 1;
    }
  }

  logger.info("demo_users_seeded", { created, updated, total: DEMO_USERS.length });
}
