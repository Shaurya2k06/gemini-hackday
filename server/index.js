import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import dotenv from "dotenv";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerApiRoutes } from "./routes.js";
import { createCorsMiddleware } from "./src/middleware/cors.js";
import { connectDb } from "./src/auth/db.js";
import { seedDemoUsers } from "./src/auth/seed-users.js";
import { registerAuthRoutes, registerChatRoutes } from "./src/auth/routes.js";
import { attachUser } from "./src/auth/middleware.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProduction = process.env.NODE_ENV === "production";

app.use(createCorsMiddleware());
app.use(express.json({ limit: "2mb" }));

export async function bootApp() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const db = await connectDb(databaseUrl);
  const PgStore = connectPgSimple(session);

  const sessionSecret = process.env.SESSION_SECRET || "zoron-dev-session-secret";
  app.use(
    session({
      name: "zoron.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new PgStore({ pool: db, createTableIfMissing: true, ttl: 60 * 60 * 24 * 14 }),
      cookie: {
        httpOnly: true,
        sameSite: isProduction ? "none" : "lax",
        secure: isProduction,
        maxAge: 1000 * 60 * 60 * 24 * 14,
      },
    })
  );

  app.use(attachUser);
  registerAuthRoutes(app);
  registerChatRoutes(app);
  registerApiRoutes(app);

  await seedDemoUsers();
  return app;
}

if (process.argv[1]?.endsWith("index.js")) {
  bootApp()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`PEF discovery API listening on http://localhost:${PORT}`);
      });
    })
    .catch((err) => {
      console.error("Failed to start server:", err);
      process.exit(1);
    });
}

export default app;
