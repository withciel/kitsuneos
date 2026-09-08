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
  onboardingStepTitle,
} from '@/lib/onboarding';
import { cn } from '@/lib/utils';
import { WORKSPACE_CHANGED_EVENT } from '@/lib/workspace-events';
import { useWorkspaceSession } from '@/lib/workspace-session';

const INITIAL: OnboardingProgress = {
  'create-database': false,
  'add-page': false,
  'connect-agent': false,
  'review-changes': false,
  firstCollection: null,
  hasAgents: false,
};

export function SetupChecklist() {
  const pathname = usePathname();
  const {
    schema,
    openChangeSetCount,
    loading: sessionLoading,
  } = useWorkspaceSession();
  const [hidden, setHidden] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState<OnboardingProgress>(INITIAL);

  const refresh = useCallback(() => {
    if (isOnboardingDismissed()) {
      setHidden(true);
      return;
    }
    if (sessionLoading && !schema) return;
    void loadOnboardingProgress({
      collections: schema?.collections ?? [],
      openChangeSetCount,
    }).then((next) => {
      setProgress(next);
      const done = ONBOARDING_STEPS.every((step) => next[step.id]);
      setHidden(done);
    });
  }, [schema, openChangeSetCount, sessionLoading]);

  useEffect(() => {
    refresh();
    window.addEventListener(WORKSPACE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    void pathname;
    refresh();
  }, [pathname, refresh]);

  const completedCount = useMemo(
    () => ONBOARDING_STEPS.filter((step) => progress[step.id]).length,
    [progress],
  );

  const nextStep = useMemo(
    () => ONBOARDING_STEPS.find((step) => !progress[step.id]),
    [progress],
  );

  const percent = Math.round((completedCount / ONBOARDING_STEPS.length) * 100);

  if (hidden) return null;

  const nextHref =
    nextStep?.id === 'add-page' && progress.firstCollection
      ? `/c/${progress.firstCollection}`
      : nextStep?.id === 'create-database' && progress.firstCollection
        ? `/c/${progress.firstCollection}`
        : (nextStep?.href ?? '/');

  return (
    <aside
      className="border-b border-border bg-muted/20 px-4 py-2"
      aria-label="Setup checklist"
    >
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-sm font-medium tracking-tight">
                Setup · {completedCount}/{ONBOARDING_STEPS.length}
              </p>
              <div
                className="h-1 w-24 overflow-hidden rounded-full bg-border sm:w-32"
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Onboarding progress"
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${Math.max(percent, 8)}%` }}
                />
              </div>
              {nextStep ? (
                <Link
                  href={nextHref}
                  className="truncate text-xs text-primary underline-offset-4 hover:underline"
                >
                  Next: {onboardingStepTitle(nextStep, progress)}
                </Link>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Hide steps' : 'Show steps'}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="size-7 shrink-0"
            aria-label="Dismiss setup checklist"
            onClick={() => {
              dismissOnboarding();
              setHidden(true);
            }}
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {expanded ? (
          <ol className="operate-enter flex flex-wrap gap-x-4 gap-y-1 pb-1">
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
                      'inline-flex items-center gap-1.5 text-xs transition-colors hover:text-foreground',
                      done ? 'text-muted-foreground' : 'text-foreground',
                    )}
                  >
                    {done ? (
                      <Check
                        className="size-3 text-primary"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className="size-3 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    {onboardingStepTitle(step, progress)}
                  </Link>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </aside>
  );
}
