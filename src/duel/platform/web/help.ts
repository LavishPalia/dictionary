// Hint and Word balances. An M2 stub: each new game starts at 1 Hint and 1 Word, so playtests don't run dry.
// M4 replaces it with the real daily allowance and earning (product spec §9).
import type { HelpWallet, Storage } from '../types';

const KEY = 'panna_duel_help';
type Balance = { hint: number; word: number };
const START: Balance = { hint: 1, word: 1 };

export function stubHelp(storage: Storage): HelpWallet {
  const read = (): Balance => {
    const b = storage.get<Balance>(KEY);
    return b && Number.isInteger(b.hint) && Number.isInteger(b.word) && b.hint >= 0 && b.word >= 0 ? b : { ...START };
  };
  return {
    balance: read,
    spend(kind) {
      const b = read();
      if (b[kind] <= 0) return false;
      b[kind]--;
      storage.set(KEY, b);
      return true;
    },
    resetForNewGame() { storage.set(KEY, { ...START }); },
  };
}
