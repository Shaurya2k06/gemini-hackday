import { randomUUID } from "node:crypto";
import { getDb } from "../db.js";

const fields = `
  id, user_id as "userId", title, raw_query as "rawQuery", structured,
  constraint_mode as "constraintMode", companies, cards,
  custom_columns as "customColumns", message,
  created_at as "createdAt", updated_at as "updatedAt"
`;

export const Chat = {
  async listByUser(userId) {
    const { rows } = await getDb().query(
      `select ${fields} from public.chats where user_id = $1 order by updated_at desc limit 50`,
      [userId]
    );
    return rows;
  },

  async findOne({ id, userId }) {
    const { rows } = await getDb().query(
      `select ${fields} from public.chats where id = $1 and user_id = $2 limit 1`,
      [id, userId]
    );
    return rows[0] ?? null;
  },

  async create({ userId, title, rawQuery, structured, constraintMode, companies, cards, customColumns, message }) {
    const { rows } = await getDb().query(
      `insert into public.chats
       (id, user_id, title, raw_query, structured, constraint_mode, companies, cards, custom_columns, message)
       values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10)
       returning ${fields}`,
      [randomUUID(), userId, title, rawQuery, structured, constraintMode, JSON.stringify(companies), JSON.stringify(cards), JSON.stringify(customColumns), message]
    );
    return rows[0];
  },

  async update({ id, userId, ...patch }) {
    const columns = {
      title: "title",
      rawQuery: "raw_query",
      structured: "structured",
      constraintMode: "constraint_mode",
      companies: "companies",
      cards: "cards",
      customColumns: "custom_columns",
      message: "message",
    };
    const entries = Object.entries(patch).filter(([key, value]) => value !== undefined && columns[key]);
    if (!entries.length) return this.findOne({ id, userId });

    const values = [id, userId];
    const assignments = entries.map(([key, value], index) => {
      values.push(["structured", "companies", "cards", "customColumns"].includes(key) ? JSON.stringify(value) : value);
      return `${columns[key]} = $${index + 3}${["structured", "companies", "cards", "customColumns"].includes(key) ? "::jsonb" : ""}`;
    });
    const { rows } = await getDb().query(
      `update public.chats set ${assignments.join(", ")}, updated_at = now()
       where id = $1 and user_id = $2 returning ${fields}`,
      values
    );
    return rows[0] ?? null;
  },
};
