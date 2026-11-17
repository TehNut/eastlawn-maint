import { defineConfig } from 'drizzle-kit';

// Only generates SQL. The app applies migrations itself when it opens the database.
export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	out: './drizzle',
	dialect: 'sqlite',
	strict: true
});
