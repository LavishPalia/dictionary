import assert from 'node:assert/strict';
import { damerauLevenshtein } from '../src/lib/search-distance';

assert.equal(damerauLevenshtein('ceremonis', 'ceremonies'), 1, 'one missing letter is one edit');
assert.equal(damerauLevenshtein('form', 'from'), 1, 'adjacent transposition is one edit');
assert.equal(damerauLevenshtein('CEREMONY', 'ceremony'), 0, 'comparison is case insensitive');
assert.equal(damerauLevenshtein('book', 'books'), 1);
assert.equal(damerauLevenshtein('', 'word'), 4);

console.log('Search distance checks passed.');
