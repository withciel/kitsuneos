import { redirect } from 'next/navigation';

/** Inbox was renamed to Changes; keep this path working for old links. */
export default async function InboxDetailRedirect({
  params,
}: {
  params: Promise<{ changeSetId: string }>;
}) {
  const { changeSetId } = await params;
  redirect(`/changes/${changeSetId}`);
}
