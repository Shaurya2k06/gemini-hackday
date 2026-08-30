import {
  exportCompaniesCsv,
  exportCompaniesPdf,
  handleMandateParse,
  handleDiscoverStream,
  handleDiscoverExpandStream,
  resolveCompanyLookup,
  handleDeepDiveStream,
  answerGeneralInfo,
  extractCustomColumn,
} from "./src/chatbot/index.js";
import { handleThesisPdfParse } from "./src/chatbot/thesis-parse.js";
import { handleVoiceMandateParse } from "./src/chatbot/voice-parse.js";
import { normalizeExportCompanies } from "./src/chatbot/export-normalize.js";
import multer from "multer";

const thesisUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype ?? "").toLowerCase();
    const name = String(file.originalname ?? "").toLowerCase();
    if (mime === "application/pdf" || name.endsWith(".pdf")) {
      cb(null, true);
      return;
    }
    cb(new Error("Only PDF files are supported"));
  },
});

const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype ?? "").toLowerCase();
    if (mime.startsWith("audio/") || mime === "video/webm") {
      cb(null, true);
      return;
    }
    cb(new Error("Only audio recordings are supported"));
  },
});

export function createSseStream(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  if (res.socket) {
    res.socket.setNoDelay(true);
    res.socket.setKeepAlive(true, 10000);
  }
  res.write(`: ${" ".repeat(2048)}\n\n`);

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  return send;
}
export function registerApiRoutes(app) {
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/mandate/parse", async (req, res) => {
    try {
      const { text, accumulatedText, priorStructured, fieldHint } = req.body ?? {};
      const result = await handleMandateParse({
        text,
        accumulatedText,
        priorStructured,
        fieldHint,
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: error.message ?? "Parse failed" });
    }
  });

  app.post("/api/mandate/parse-thesis", (req, res) => {
    thesisUpload.single("file")(req, res, async (err) => {
      if (err) {
        res.status(400).json({ error: err.message ?? "Upload failed" });
        return;
      }
      try {
        if (!req.file?.buffer) {
          res.status(400).json({ error: "PDF file is required" });
          return;
        }
        const result = await handleThesisPdfParse(req.file.buffer, {
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        });
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message ?? "Thesis parse failed" });
      }
    });
  });

  app.post("/api/mandate/parse-audio", (req, res) => {
    voiceUpload.single("audio")(req, res, async (err) => {
      if (err) {
        res.status(400).json({ error: err.message ?? "Upload failed" });
        return;
      }
      try {
        if (!req.file?.buffer) {
          res.status(400).json({ error: "Audio recording is required" });
          return;
        }
        let priorStructured = null;
        if (req.body?.priorStructured) {
          try {
            priorStructured = JSON.parse(req.body.priorStructured);
          } catch {
            priorStructured = null;
          }
        }
        const result = await handleVoiceMandateParse(
          req.file.buffer,
          { originalname: req.file.originalname, mimetype: req.file.mimetype },
          { priorStructured, accumulatedText: req.body?.accumulatedText ?? "" }
        );
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message ?? "Voice parse failed" });
      }
    });
  });

  app.post("/api/discover/stream", async (req, res) => {
    const { structured, rawQuery, constraintMode } = req.body ?? {};
    const send = createSseStream(res);
    send("progress", { step: "Starting target screening…", detail: null, at: Date.now() });

    try {
      const result = await handleDiscoverStream({
        structured,
        rawQuery: rawQuery ?? structured?.raw_query ?? "",
        constraintMode,
        onProgress: (evt) => send("progress", evt),
      });
      send("result", result);
    } catch (error) {
      send("error", { error: error.message ?? "Discovery failed" });
    } finally {
      res.end();
    }
  });

  app.post("/api/discover/expand/stream", async (req, res) => {
    const { structured, rawQuery, existingDomains, additionalCount, constraintMode } = req.body ?? {};
    const send = createSseStream(res);
    send("progress", { step: "Expanding shortlist…", detail: null, at: Date.now() });

    try {
      const result = await handleDiscoverExpandStream({
        structured,
        rawQuery: rawQuery ?? structured?.raw_query ?? "",
        existingDomains: existingDomains ?? [],
        additionalCount,
        constraintMode,
        onProgress: (evt) => send("progress", evt),
      });
      send("result", result);
    } catch (error) {
      send("error", { error: error.message ?? "Expansion failed" });
    } finally {
      res.end();
    }
  });

  app.post("/api/company/lookup/stream", async (req, res) => {
    const { structured } = req.body ?? {};
    const send = createSseStream(res);
    send("progress", { step: "Looking up company…", detail: null, at: Date.now() });

    try {
      const result = await resolveCompanyLookup({
        structured,
        onProgress: (evt) => send("progress", evt),
      });
      send("result", result);
    } catch (error) {
      send("error", { error: error.message ?? "Lookup failed" });
    } finally {
      res.end();
    }
  });

  app.post("/api/company/deep-dive/stream", async (req, res) => {
    const { company, structured, userQuestion } = req.body ?? {};
    const send = createSseStream(res);
    send("progress", { step: "Opening dossier…", detail: company?.name, at: Date.now() });

    try {
      const result = await handleDeepDiveStream({
        company,
        structured,
        userQuestion,
        onProgress: (evt) => send("progress", evt),
      });
      send("result", result);
    } catch (error) {
      send("error", { error: error.message ?? "Deep dive failed" });
    } finally {
      res.end();
    }
  });

  app.post("/api/general-info/stream", async (req, res) => {
    const { message } = req.body ?? {};
    const send = createSseStream(res);
    send("progress", { step: "Thinking…", detail: null, at: Date.now() });

    try {
      const text = await answerGeneralInfo(message);
      send("result", { text, type: "general_info" });
    } catch (error) {
      send("error", { error: error.message ?? "Could not answer" });
    } finally {
      res.end();
    }
  });

  app.post("/api/discover/custom-column", async (req, res) => {
    try {
      if (!process.env.GEMINI_API_KEY) {
        res.status(503).json({ error: "GEMINI_API_KEY is not set" });
        return;
      }
      const { query, cards } = req.body ?? {};
      const result = await extractCustomColumn(cards, query);
      res.json(result);
    } catch (error) {
      const status = error.status ?? 500;
      res.status(status).json({ error: error.message ?? "Custom column extraction failed" });
    }
  });

  app.post("/api/export/csv", (req, res) => {
    const { companies } = req.body ?? {};
    const rankedResults = normalizeExportCompanies(companies);
    const result = exportCompaniesCsv(rankedResults);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  });

  app.post("/api/export/pdf", (req, res) => {
    const { companies } = req.body ?? {};
    const rankedResults = normalizeExportCompanies(companies);
    const result = exportCompaniesPdf(rankedResults);
    if (result.error) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
    res.send(Buffer.from(result.pdf, "binary"));
  });
}
