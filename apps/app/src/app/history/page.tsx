import { redirect } from 'next/navigation';

export default function LegacyHistoryRedirect() {
  redirect('/settings');
}
