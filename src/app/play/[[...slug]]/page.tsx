import PlayClient from '../PlayClient';

export const metadata = { title: 'Panna Duel' };

// Every /play address is one page; the Duel's own router picks the screen.
export default function PlayPage() {
  return <PlayClient />;
}
