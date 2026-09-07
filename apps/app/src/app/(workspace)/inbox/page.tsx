import { redirect } from 'next/navigation';

/** Inbox was renamed to Changes; keep this path working for old links. */
export default function InboxRedirect() {
  redirect('/changes');
}
