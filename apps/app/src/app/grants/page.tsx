import { redirect } from 'next/navigation';

export default function LegacyGrantsRedirect() {
  redirect('/settings/grants');
}
