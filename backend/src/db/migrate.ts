import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  const candidates = [path.join(__dirname, 'schema.sql'), path.resolve(process.cwd(), 'src', 'db', 'schema.sql')];
  const schemaPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!schemaPath) throw new Error(`Could not find schema.sql. Checked: ${candidates.join(', ')}`);
  const sql = fs.readFileSync(schemaPath, 'utf8');

  const client = await pool.connect();
  try {
    console.log('[PostgreSQL] Ensuring schema and PostGIS tables exist...');
    await client.query(sql);
    console.log('[PostgreSQL] Migrations verified successfully.');
  } catch (error) {
    console.error('[PostgreSQL] Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Allow direct execution
if (process.argv[1] && process.argv[1].includes('migrate')) {
  runMigrations()
    .then(() => {
      console.log('[PostgreSQL] Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[PostgreSQL] Migration error:', err);
      process.exit(1);
    });
}
