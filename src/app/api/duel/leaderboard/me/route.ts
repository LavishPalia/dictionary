import { getMe } from '@/duel/server/board';

export const dynamic = 'force-dynamic';
export const GET = (req: Request) => getMe(req);
