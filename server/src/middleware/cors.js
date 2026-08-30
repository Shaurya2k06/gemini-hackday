import cors from "cors";

function parseOrigins(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function createCorsMiddleware() {
  const isProduction = process.env.NODE_ENV === "production";
  let origins = parseOrigins(process.env.CORS_ORIGINS);

  if (origins.length === 0) {
    if (isProduction) {
      console.warn(
        "[cors] CORS_ORIGINS is empty — cross-origin requests will be rejected"
      );
      origins = [];
    } else {
      origins = ["http://localhost:5173"];
    }
  }

  return cors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  });
}
