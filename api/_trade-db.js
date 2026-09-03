const postgres = require("postgres");

const DB_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
let db;

function client() {
  if (!db) db = postgres(DB_URL, { ssl: "require", max: 5, idle_timeout: 20 });
  return db;
}

async function lock(ids) {
  if (!DB_URL) throw new Error("trade database is not configured");
  const reserved = await client().reserve();
  const keys = [...new Set(ids.filter(Boolean).map(String))].sort();
  try {
    for (const key of keys) await reserved`select pg_advisory_lock(hashtext(${"hobake-trade:" + key}))`;
  } catch (e) {
    reserved.release();
    throw e;
  }
  let done = false;
  return async () => {
    if (done) return;
    done = true;
    try {
      for (const key of keys.slice().reverse()) {
        await reserved`select pg_advisory_unlock(hashtext(${"hobake-trade:" + key}))`;
      }
    } finally {
      reserved.release();
    }
  };
}

module.exports = { configured: () => Boolean(DB_URL), lock };
