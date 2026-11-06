import { renamePlayer } from '@/duel/server/players';

export const dynamic = 'force-dynamic';
export const PATCH = (req: Request) => renamePlayer(req);
