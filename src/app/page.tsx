import DictionaryApp from '@/components/DictionaryApp';
import { getMeta, getSpreadPages } from '@/lib/book-data';

export default function HomePage() {
  return <DictionaryApp initialMeta={getMeta()} initialPages={getSpreadPages(1)} initialPage={1} />;
}
