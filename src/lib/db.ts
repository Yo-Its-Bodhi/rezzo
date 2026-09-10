import "server-only";

import postgres from "postgres";

let client: ReturnType<typeof postgres> | undefined;

export function db() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for reservation storage.");
  }
  client ??= postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: process.env.DATABASE_SSL === "require" ? "require" : undefined,
  });
  return client;
}
