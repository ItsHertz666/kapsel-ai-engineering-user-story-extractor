import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = Bun.env.DATABASE_URL;

if (!connectionString) {
	throw new Error('DATABASE_URL environment variable is missing');
}

const client = postgres(connectionString);
export const db = drizzle(client, { schema });
