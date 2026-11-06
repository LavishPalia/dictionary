import { submitGame } from '@/duel/server/games';

export const dynamic = 'force-dynamic';
export const POST = (req: Request) => submitGame(req);
