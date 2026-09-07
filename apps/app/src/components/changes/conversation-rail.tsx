'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

interface Comment {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/**
 * Right rail of the PR shell: rationale (why this change was proposed)
 * plus a GitHub-PR-like conversation thread backed by
 * GET/POST /api/review/[changeSetId]/comments.
 */
export function ConversationRail({
  changeSetId,
  author,
  createdAt,
  rationale,
}: {
  changeSetId: string;
  author: string;
  createdAt: string;
  rationale: string | null;
}) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/review/${changeSetId}/comments`);
      const body = (await response.json()) as {
        comments?: Comment[];
        error?: string;
      };
      if (!response.ok) {
        setError(body.error ?? 'Failed to load comments');
        return;
      }
      setComments(body.comments ?? []);
    } catch {
      setError('Failed to load comments');
    }
  }, [changeSetId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitComment() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setPosting(true);
    setError('');
    try {
      const response = await fetch(`/api/review/${changeSetId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? 'Failed to comment');
      setDraft('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPosting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-4">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Conversation
        </p>
        <p className="mt-2 text-sm">
          <span className="font-medium">{author}</span> opened this on{' '}
          {new Date(createdAt).toLocaleString()}
        </p>
        {rationale ? (
          <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-sm text-muted-foreground">
            {rationale}
          </div>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-auto p-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {comments === null ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No comments yet. Leave one to explain a decision.
          </p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="rounded-md border border-border bg-card p-2.5 text-sm"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">{comment.authorName}</span>
                <span className="text-xs text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-foreground">
                {comment.body}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 border-t border-border p-3">
        <Textarea
          placeholder="Leave a comment"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
        />
        <Button
          size="sm"
          className="w-full"
          disabled={posting || draft.trim().length === 0}
          onClick={() => void submitComment()}
        >
          {posting ? 'Commenting…' : 'Comment'}
        </Button>
      </div>
    </div>
  );
}
