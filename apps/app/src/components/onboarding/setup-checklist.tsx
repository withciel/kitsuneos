'use client';

import { Check, Circle, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  dismissOnboarding,
  isOnboardingDismissed,
  loadOnboardingProgress,
  ONBOARDING_STEPS,
  type OnboardingProgress,
} from '@/lib/onboarding';
import { cn } from '@/lib/utils';
import { WORKSPACE_CHANGED_EVENT } from '@/lib/workspace-events';

const INITIAL: OnboardingProgress = {
  'create-database': false,
  'add-page': false,
  'connect-agent': false,
  'review-inbox': false,
  firstCollection: null,
};

export function SetupChecklist() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(true);
  const [progress, setProgress] = useState<OnboardingProgress>(INITIAL);

  const refresh = useCallback(() => {
    if (isOnboardingDismissed()) {
      setHidden(true);
      return;
    }
    void loadOnboardingProgress().then((next) => {
      setProgress(next);
      const done = ONBOARDING_STEPS.every((step) => next[step.id]);
      setHidden(done);
    });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    // Recompute after route changes (e.g. first database or Inbox visit).
    void pathname;
    refresh();
  }, [pathname, refresh]);

  const completedCount = useMemo(
    () => ONBOARDING_STEPS.filter((step) => progress[step.id]).length,
    [progress],
  );

  const percent = Math.round((completedCount / ONBOARDING_STEPS.length) * 100);

  if (hidden) return null;

  return (
    <aside
      className="border-b border-border bg-muted/30 px-4 py-3"
      aria-label="Setup checklist"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium tracking-tight">
              Get to your first agent review
            </p>
            <p className="text-xs text-muted-foreground">
              {completedCount} of {ONBOARDING_STEPS.length} done — create a
              database, add a page, connect an AI helper, then watch Inbox.
            </p>
            <div
              className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-border"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Onboarding progress"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${Math.max(percent, 8)}%` }}
              />
            </div>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-8 shrink-0"
            aria-label="Dismiss setup checklist"
            onClick={() => {
              dismissOnboarding();
              setHidden(true);
            }}
          >
            <X className="size-4" />
          </Button>
        </div>

        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {ONBOARDING_STEPS.map((step) => {
            const done = progress[step.id];
            const href =
              step.id === 'add-page' && progress.firstCollection
                ? `/c/${progress.firstCollection}`
                : step.id === 'create-database' && progress.firstCollection
                  ? `/c/${progress.firstCollection}`
                  : step.href;

            return (
              <li key={step.id}>
                <Link
                  href={href}
                  className={cn(
                    'flex h-full flex-col gap-1 rounded-md border border-border bg-background p-3 transition-colors hover:border-primary/40',
                    done && 'opacity-70',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    {done ? (
                      <Check
                        className="size-4 text-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    {step.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {step.description}
                  </span>
                  <span className="mt-auto pt-2 text-xs font-medium text-primary">
                    {done ? 'Done' : step.cta}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
