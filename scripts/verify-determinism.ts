// Builds the dictionary database twice from the committed sources and checks the table digests match
// (and match data/dictionary.db, if it exists).
// Usage: npm run verify:determinism
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DB_PATH, buildDatabase } from './init-db';
import { digestDatabase } from './lib/db-digest';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'panna-db-'));
try {
  const a = path.join(tmp, 'a.db');
  const b = path.join(tmp, 'b.db');
  buildDatabase(a);
  buildDatabase(b);
  const da = digestDatabase(a);
  const db = digestDatabase(b);
  console.log(`build 1: ${da.digest}`);
  console.log(`build 2: ${db.digest}`);
  let ok = da.digest === db.digest;
  if (fs.existsSync(DB_PATH)) {
    const current = digestDatabase(DB_PATH);
    console.log(`data/dictionary.db: ${current.digest}`);
    if (current.digest !== da.digest) {
      console.error('data/dictionary.db differs from a fresh build — run `npm run build:data`.');
      ok = false;
    }
  }
  if (!ok) {
    for (const t of Object.keys(da.tables)) {
      if (da.tables[t] !== db.tables[t]) console.error(`  table ${t} differs between builds`);
    }
    console.error('FAIL: database build is not deterministic.');
    process.exit(1);
  }
  console.log('✓ Database build is deterministic.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
