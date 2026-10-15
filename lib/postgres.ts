import "server-only";
import postgres from "postgres";
import { databaseSSL } from "./access-core";

let sql: ReturnType<typeof postgres> | undefined;
export function postgresDatabase() {
  if (sql) return sql;
  const address = process.env.VIBIES_DATABASE_URL;
  if (!address) throw new Error("Access unavailable");
  const url = new URL(address);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Access unavailable");
  sql = postgres(address, { max: 3, prepare: false,
    ssl: databaseSSL(url.hostname, process.env.VIBIES_DATABASE_CA),
    connect_timeout: 10, idle_timeout: 20, connection: { statement_timeout: 10000 }, onnotice: () => {} });
  return sql;
}

