import { registerPlayer } from '@/duel/server/players';

export const dynamic = 'force-dynamic';
export const POST = (req: Request) => registerPlayer(req);
