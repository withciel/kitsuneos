import { redirect } from 'next/navigation';

/** Old Grants URL → simplified Access settings. */
export default function SettingsGrantsRedirectPage() {
  redirect('/settings/access');
}
