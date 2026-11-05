import { getBoard } from '@/duel/server/board';

export const dynamic = 'force-dynamic';
export const GET = (req: Request) => getBoard(req);
