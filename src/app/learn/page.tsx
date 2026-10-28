import DictionaryApp from '@/components/DictionaryApp';
import { getMeta, getSpreadPages } from '@/lib/book-data';

export const metadata = { title: 'How to learn with Panna — पन्ना (Panna)' };

// The study guide at its own address, so it can be shared; the book waits underneath at page 1, as on the front page.
export default function LearnPage() {
  return <DictionaryApp initialMeta={getMeta()} initialPages={getSpreadPages(1)} initialPage={1} initialSection="learn" />;
}
