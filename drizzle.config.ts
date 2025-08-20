import type { Config } from 'drizzle-kit';

export default {
  schema: './src/utils/db/schema.ts',
  out: './migrations',
  driver: 'd1',
  dbCredentials: {
    wranglerConfigPath: './wrangler.toml',
    dbName: 'gemini-code',
  },
} satisfies Config;