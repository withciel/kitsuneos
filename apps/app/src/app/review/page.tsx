'use client';

import { useState } from 'react';
import { ActionConsent } from '@kitsuneos/ui';

export default function ReviewPage() {
  const [message, setMessage] = useState('');

  return (
    <main className="page">
      <h1>Review queue</h1>
      <ActionConsent
        systems={['opportunities']}
        actions={[
          {
            id: '1',
            collection: 'opportunities',
            field: 'next_step',
            op: 'update',
            after: 'Send updated pricing sheet',
            status: 'proposed',
          },
        ]}
        intent="Agent proposes updating the next step based on the renewal thread."
        reversible
        scope="write"
        onApprove={() => setMessage('Approved. Run apply from the console API.')}
        onDecline={() => setMessage('Declined.')}
      />
      {message ? <p role="status">{message}</p> : null}
    </main>
  );
}
