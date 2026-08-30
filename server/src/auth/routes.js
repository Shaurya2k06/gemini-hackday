import bcrypt from "bcryptjs";
import { User } from "./models/User.js";
import { Chat } from "./models/Chat.js";
import { requireAuth } from "./middleware.js";

function chatTitleFromQuery(rawQuery) {
  const text = String(rawQuery ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "Untitled screening";
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function serializeChatSummary(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    rawQuery: doc.rawQuery,
    companyCount: Array.isArray(doc.companies) ? doc.companies.length : 0,
    constraintMode: doc.constraintMode,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

function serializeChat(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    rawQuery: doc.rawQuery,
    structured: doc.structured,
    constraintMode: doc.constraintMode,
    companies: doc.companies ?? [],
    cards: doc.cards ?? [],
    customColumns: doc.customColumns ?? [],
    message: doc.message ?? null,
    companyCount: Array.isArray(doc.companies) ? doc.companies.length : 0,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

export function registerAuthRoutes(app) {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const username = String(req.body?.username ?? "")
        .trim()
        .toLowerCase();
      const password = String(req.body?.password ?? "");
      if (!username || !password) {
        res.status(400).json({ error: "Username and password are required" });
        return;
      }

      const user = await User.findOne({ username });
      if (!user) {
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      req.session.userId = String(user._id);
      req.session.username = user.username;
      res.json({ user: { id: String(user._id), username: user.username } });
    } catch (error) {
      res.status(500).json({ error: error.message ?? "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        res.status(500).json({ error: "Logout failed" });
        return;
      }
      res.clearCookie("zoron.sid");
      res.json({ ok: true });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.session?.userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json({
      user: {
        id: req.session.userId,
        username: req.session.username,
      },
    });
  });
}

export function registerChatRoutes(app) {
  app.get("/api/chats", requireAuth, async (req, res) => {
    try {
      const chats = await Chat.find({ userId: req.session.userId })
        .sort({ updatedAt: -1 })
        .limit(50)
        .select("title rawQuery companies constraintMode createdAt updatedAt");
      res.json({ chats: chats.map(serializeChatSummary) });
    } catch (error) {
      res.status(500).json({ error: error.message ?? "Could not list chats" });
    }
  });

  app.get("/api/chats/:id", requireAuth, async (req, res) => {
    try {
      const chat = await Chat.findOne({
        _id: req.params.id,
        userId: req.session.userId,
      });
      if (!chat) {
        res.status(404).json({ error: "Chat not found" });
        return;
      }
      res.json({ chat: serializeChat(chat) });
    } catch (error) {
      res.status(500).json({ error: error.message ?? "Could not load chat" });
    }
  });

  app.post("/api/chats", requireAuth, async (req, res) => {
    try {
      const {
        rawQuery = "",
        structured = null,
        constraintMode = "heavy",
        companies = [],
        cards = [],
        customColumns = [],
        message = null,
        title = null,
      } = req.body ?? {};

      if (!Array.isArray(companies) || companies.length === 0) {
        res.status(400).json({ error: "A non-empty shortlist is required to save a chat" });
        return;
      }

      const chat = await Chat.create({
        userId: req.session.userId,
        title: title ? String(title).slice(0, 200) : chatTitleFromQuery(rawQuery),
        rawQuery: String(rawQuery ?? ""),
        structured,
        constraintMode: constraintMode === "lite" ? "lite" : "heavy",
        companies,
        cards: Array.isArray(cards) ? cards : [],
        customColumns: Array.isArray(customColumns) ? customColumns : [],
        message: message ?? null,
      });

      res.status(201).json({ chat: serializeChat(chat) });
    } catch (error) {
      res.status(500).json({ error: error.message ?? "Could not save chat" });
    }
  });

  app.patch("/api/chats/:id", requireAuth, async (req, res) => {
    try {
      const chat = await Chat.findOne({
        _id: req.params.id,
        userId: req.session.userId,
      });
      if (!chat) {
        res.status(404).json({ error: "Chat not found" });
        return;
      }

      const body = req.body ?? {};
      if (body.rawQuery != null) chat.rawQuery = String(body.rawQuery);
      if (body.structured !== undefined) chat.structured = body.structured;
      if (body.constraintMode != null) {
        chat.constraintMode = body.constraintMode === "lite" ? "lite" : "heavy";
      }
      if (Array.isArray(body.companies)) {
        if (body.companies.length === 0) {
          res.status(400).json({ error: "Shortlist cannot be empty" });
          return;
        }
        chat.companies = body.companies;
      }
      if (Array.isArray(body.cards)) chat.cards = body.cards;
      if (Array.isArray(body.customColumns)) chat.customColumns = body.customColumns;
      if (body.message !== undefined) chat.message = body.message;
      if (body.title != null) chat.title = String(body.title).slice(0, 200);

      await chat.save();
      res.json({ chat: serializeChat(chat) });
    } catch (error) {
      res.status(500).json({ error: error.message ?? "Could not update chat" });
    }
  });
}
