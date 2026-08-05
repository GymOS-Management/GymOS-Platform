import { redirect } from 'next/navigation';
import { LANDING_ROUTE } from '@/lib/nav/items';

/** The root is nobody's destination; the admin layout guards the landing route itself. */
export default function RootPage() {
  redirect(LANDING_ROUTE);
}
