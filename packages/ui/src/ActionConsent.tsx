import { useEffect, useId, useRef, useState } from 'react';

export interface ConsentAction {
  id: string;
  collection: string;
  field?: string;
  op: string;
  before?: unknown;
  after?: unknown;
  status?: string;
}

export interface ConsentDecision {
  opId: string;
  status: 'approved' | 'rejected';
}

export interface ActionConsentProps {
  systems: string[];
  actions: ConsentAction[];
  intent?: string;
  reversible: boolean;
  scope: string;
  onSubmit: (input: { decisions: ConsentDecision[]; apply: boolean }) => void;
  onDecline: () => void;
}

function renderValue(value: unknown): string {
  if (value === undefined) {
    return '(empty)';
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

function decisionsFromActions(
  actions: ConsentAction[],
): Record<string, ConsentDecision['status']> {
  const next: Record<string, ConsentDecision['status']> = {};
  for (const action of actions) {
    if (action.status === 'approved' || action.status === 'rejected') {
      next[action.id] = action.status;
    }
  }
  return next;
}

export function ActionConsent({
  systems,
  actions,
  intent,
  reversible,
  scope,
  onSubmit,
  onDecline,
}: ActionConsentProps) {
  const listId = useId();
  const declineRef = useRef<HTMLButtonElement>(null);
  const [decisions, setDecisions] = useState<
    Record<string, ConsentDecision['status']>
  >(() => decisionsFromActions(actions));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onDecline();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDecline]);

  const allDecided = actions.every((action) => decisions[action.id]);

  function collect(): ConsentDecision[] {
    return actions.flatMap((action) => {
      const status = decisions[action.id];
      return status ? [{ opId: action.id, status }] : [];
    });
  }

  return (
    <section
      className="k-action-consent"
      aria-labelledby={`${listId}-heading`}
      aria-describedby={`${listId}-count`}
    >
      <h2 id={`${listId}-heading`}>Review proposed changes</h2>
      {intent ? <p className="k-action-consent__intent">{intent}</p> : null}
      <p className="k-action-consent__systems">
        Collections: {systems.join(', ')} · Scope: {scope}
      </p>
      <p id={`${listId}-count`} className="k-action-consent__systems">
        {actions.length} operation{actions.length === 1 ? '' : 's'} listed
      </p>
      {!reversible ? (
        <p className="k-action-consent__irreversible">
          Some changes cannot be reversed once applied.
        </p>
      ) : null}
      <ol
        className="k-action-consent__operations"
        aria-labelledby={`${listId}-count`}
      >
        {actions.map((action) => (
          <li key={action.id} className="k-action-consent__operation">
            <strong>
              {action.collection}.{action.field ?? 'record'}
            </strong>{' '}
            — {action.op}
            {action.status ? ` [${action.status}]` : ''}
            <pre className="k-action-consent__diff">
              <span className="k-action-consent__before">
                - {renderValue(action.before)}
              </span>
              {'\n'}
              <span className="k-action-consent__after">
                + {renderValue(action.after)}
              </span>
            </pre>
            <div className="k-action-consent__op-actions">
              <button
                type="button"
                className={
                  decisions[action.id] === 'approved'
                    ? 'k-action-consent__approve k-action-consent__choice--active'
                    : 'k-action-consent__approve'
                }
                onClick={() =>
                  setDecisions((current) => ({
                    ...current,
                    [action.id]: 'approved',
                  }))
                }
              >
                Approve
              </button>
              <button
                type="button"
                className={
                  decisions[action.id] === 'rejected'
                    ? 'k-action-consent__decline k-action-consent__choice--active'
                    : 'k-action-consent__decline'
                }
                onClick={() =>
                  setDecisions((current) => ({
                    ...current,
                    [action.id]: 'rejected',
                  }))
                }
              >
                Reject
              </button>
            </div>
          </li>
        ))}
      </ol>
      <div className="k-action-consent__actions">
        <button
          ref={declineRef}
          type="button"
          className="k-action-consent__decline"
          onClick={onDecline}
        >
          Decline all
        </button>
        <button
          type="button"
          className="k-action-consent__approve"
          disabled={collect().length === 0}
          onClick={() => onSubmit({ decisions: collect(), apply: false })}
        >
          Submit review
        </button>
        <button
          type="button"
          className="k-action-consent__approve"
          disabled={!allDecided}
          onClick={() => onSubmit({ decisions: collect(), apply: true })}
        >
          Apply decided operations
        </button>
      </div>
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return (
    <span className={`k-status-badge k-status-badge--${normalized}`}>
      {status}
    </span>
  );
}
