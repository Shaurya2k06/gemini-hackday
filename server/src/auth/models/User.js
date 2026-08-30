import { getDb } from "../db.js";

export const User = {
  async findOne({ username }) {
    const { rows } = await getDb().query(
      `select id, username, password_hash as "passwordHash"
       from public.users where username = $1 limit 1`,
      [username]
    );
    return rows[0] ?? null;
  },

  async create({ username, passwordHash }) {
    const { rows } = await getDb().query(
      `insert into public.users (username, password_hash)
       values ($1, $2)
       returning id, username, password_hash as "passwordHash"`,
      [username, passwordHash]
    );
    return rows[0];
  },

  async updatePassword(id, passwordHash) {
    await getDb().query(
      "update public.users set password_hash = $1, updated_at = now() where id = $2",
      [passwordHash, id]
    );
  },
};
