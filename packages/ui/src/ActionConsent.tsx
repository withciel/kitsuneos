import { useEffect, useId, useRef } from 'react';

export interface ConsentAction {
  id: string;
  collection: string;
  field?: string;
  op: string;
  before?: unknown;
  after?: unknown;
  status?: string;
}

export interface ActionConsentProps {
  systems: string[];
  actions: ConsentAction[];
  intent?: string;
  reversible: boolean;
  scope: string;
  onApprove: () => void;
  onDecline: () => void;
}

export function ActionConsent({
  systems,
  actions,
  intent,
  reversible,
  scope,
  onApprove,
  onDecline,
}: ActionConsentProps) {
  const listId = useId();
  const declineRef = useRef<HTMLButtonElement>(null);

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
      <ol className="k-action-consent__operations" aria-labelledby={`${listId}-count`}>
        {actions.map((action) => (
          <li key={action.id} className="k-action-consent__operation">
            <strong>
              {action.collection}.{action.field ?? 'record'}
            </strong>{' '}
            — {action.op}
            {action.status ? ` [${action.status}]` : ''}
          </li>
        ))}
      </ol>
      <div className="k-action-consent__actions">
        <button
          ref={declineRef}
          type="button"
          className="k-action-consent__decline"
          onClick={onDecline}
          autoFocus
        >
          Decline changes
        </button>
        <button type="button" className="k-action-consent__approve" onClick={onApprove}>
          Approve changes
        </button>
      </div>
    </section>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  return <span className={`k-status-badge k-status-badge--${normalized}`}>{status}</span>;
}
