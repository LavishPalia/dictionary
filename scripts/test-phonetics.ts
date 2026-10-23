import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { cmuToDevanagari, pronunciationFor } from './phonetics';

assert.equal(cmuToDevanagari('S K UW1 L'), 'स्कूल');
assert.equal(cmuToDevanagari('Z H AE1 N'), 'ज़ैन');
const heteronyms = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data/sources/heteronyms.json'), 'utf8'));
const cmu = { record: 'R AH0 K AO1 R D' };
assert.equal(pronunciationFor('record', 'n.', cmu, heteronyms), cmuToDevanagari('R AH0 K AO1 R D'));
assert.equal(pronunciationFor('record', 'v.', cmu, heteronyms), cmuToDevanagari('R IH0 K AO1 R D'));
assert.equal(pronunciationFor('missing', 'n.', cmu, heteronyms), null);
console.log('CMUdict phonetics and heteronym checks passed.');
