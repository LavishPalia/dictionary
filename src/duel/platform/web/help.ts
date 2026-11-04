// Hint and Word balances on the device; the rules are in src/duel/help-rules.ts.
import { balanceOf, earnInto, HELP_KEY, readWallet, spendFrom } from '../../help-rules';
import type { HelpWallet, Storage } from '../types';

/** `today` is read on every call, so the free ones refill at IST midnight without a reload. */
export function webHelp(storage: Storage, today: () => string): HelpWallet {
  const read = () => readWallet(storage.get(HELP_KEY), today());
  return {
    balance: () => balanceOf(read()),
    spend(kind) {
      const w = spendFrom(read(), kind);
      if (!w) return false;
      storage.set(HELP_KEY, w);
      return true;
    },
    earn(gain) { storage.set(HELP_KEY, earnInto(read(), gain)); },
  };
}
