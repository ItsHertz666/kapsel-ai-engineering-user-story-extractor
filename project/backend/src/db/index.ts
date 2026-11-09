import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let connectionString = Bun.env.DATABASE_URL;
// During test runs, default to the isolated test database if not provided.
if (!connectionString && Bun.env.NODE_ENV === 'test') {
  connectionString = 'postgresql://postgres@localhost:5432/kapsel_test';
}


if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is missing');
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
