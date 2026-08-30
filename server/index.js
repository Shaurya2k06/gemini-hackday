import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import dotenv from "dotenv";
import session from "express-session";
import MongoStore from "connect-mongo";
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
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not set");
  }

  await connectDb(mongoUri);

  const sessionSecret = process.env.SESSION_SECRET || "zoron-dev-session-secret";
  app.use(
    session({
      name: "zoron.sid",
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: mongoUri,
        ttl: 60 * 60 * 24 * 14,
      }),
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
