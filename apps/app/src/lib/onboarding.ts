'use client';

const DISMISS_KEY = 'kitsuneos.onboarding.dismissed';
const SEEN_CHANGES_KEY = 'kitsuneos.onboarding.seen-changes';

export type OnboardingStepId =
  | 'create-database'
  | 'add-page'
  | 'connect-agent'
  | 'review-changes';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  cta: string;
}

/** Minimum path to value: human write → agent path → review loop. */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'create-database',
    title: 'Create a database',
    description: 'A shared table for you and your agents.',
    href: '/',
    cta: 'Create database',
  },
  {
    id: 'add-page',
    title: 'Add your first page',
    description: 'Put a real record in — that is your first human write.',
    href: '/',
    cta: 'Open database',
  },
  {
    id: 'connect-agent',
    title: 'Connect an AI helper',
    description: 'Create an agent and paste MCP config into Cursor or Claude.',
    href: '/agents',
    cta: 'Open Agents',
  },
  {
    id: 'review-changes',
    title: 'Know where reviews land',
    description: 'Agent proposals show up in Changes for approve or merge.',
    href: '/changes',
    cta: 'Open Changes',
  },
];

export function isOnboardingDismissed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissOnboarding(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

export function markInboxSeen(): void {
  try {
    window.localStorage.setItem(SEEN_CHANGES_KEY, '1');
  } catch {
    // ignore
  }
}

export function markChangesSeen(): void {
  markInboxSeen();
}

function hasSeenChanges(): boolean {
  try {
    return window.localStorage.getItem(SEEN_CHANGES_KEY) === '1';
  } catch {
    return false;
  }
}

export interface OnboardingProgress {
  'create-database': boolean;
  'add-page': boolean;
  'connect-agent': boolean;
  'review-changes': boolean;
  firstCollection: string | null;
}

export async function loadOnboardingProgress(): Promise<OnboardingProgress> {
  const progress: OnboardingProgress = {
    'create-database': false,
    'add-page': false,
    'connect-agent': false,
    'review-changes': false,
    firstCollection: null,
  };

  try {
    const [schemaRes, agentsRes, reviewRes] = await Promise.all([
      fetch('/api/schema'),
      fetch('/api/agents'),
      fetch('/api/review'),
    ]);

    if (schemaRes.ok) {
      const schema = (await schemaRes.json()) as {
        collections?: Array<{ name: string }>;
      };
      const first = schema.collections?.[0]?.name ?? null;
      progress.firstCollection = first;
      progress['create-database'] = Boolean(first);

      if (first) {
        const queryRes = await fetch('/api/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            collection: first,
            fields: ['id'],
            limit: 1,
          }),
        });
        if (queryRes.ok) {
          const body = (await queryRes.json()) as { rows?: unknown[] };
          progress['add-page'] = (body.rows?.length ?? 0) > 0;
        }
      }
    }

    if (agentsRes.ok) {
      const agents = (await agentsRes.json()) as {
        agents?: unknown[];
      };
      progress['connect-agent'] = (agents.agents?.length ?? 0) > 0;
    }

    if (reviewRes.ok) {
      const review = (await reviewRes.json()) as {
        changeSets?: unknown[];
      };
      progress['review-changes'] =
        (review.changeSets?.length ?? 0) > 0 || hasSeenChanges();
    }
  } catch {
    return progress;
  }

  return progress;
}
