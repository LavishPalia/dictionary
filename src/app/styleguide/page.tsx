import { notFound } from 'next/navigation';
import { Styleguide } from './Styleguide';

// Development aid for the redesign: every shared building block on one page. Not shipped.
export default function StyleguidePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Styleguide />;
}
