/** Unrestricted Damerau–Levenshtein distance, with case and accents ignored. */
export function damerauLevenshtein(left: string, right: string): number {
  const a = left.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const b = right.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const maxDistance = a.length + b.length;
  const matrix = Array.from({ length: a.length + 2 }, () => Array<number>(b.length + 2).fill(0));
  matrix[0][0] = maxDistance;
  for (let i = 0; i <= a.length; i++) {
    matrix[i + 1][0] = maxDistance;
    matrix[i + 1][1] = i;
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j + 1] = maxDistance;
    matrix[1][j + 1] = j;
  }

  const lastSeen = new Map<string, number>();
  for (let i = 1; i <= a.length; i++) {
    let lastMatchColumn = 0;
    for (let j = 1; j <= b.length; j++) {
      const priorRow = lastSeen.get(b[j - 1]) ?? 0;
      const priorColumn = lastMatchColumn;
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      if (substitutionCost === 0) lastMatchColumn = j;
      matrix[i + 1][j + 1] = Math.min(
        matrix[i][j] + substitutionCost,
        matrix[i + 1][j] + 1,
        matrix[i][j + 1] + 1,
        matrix[priorRow][priorColumn] + (i - priorRow - 1) + 1 + (j - priorColumn - 1),
      );
    }
    lastSeen.set(a[i - 1], i);
  }
  return matrix[a.length + 1][b.length + 1];
}
