import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      <header className="hero">
        <h1>Agents propose. You approve.</h1>
        <p>
          KitsuneOS is a database layer where agents propose changes and humans approve them
          before anything lands.
        </p>
        <Link className="cta" href="https://app.kitsuneos.com">
          Start free
        </Link>
      </header>

      <section id="trust">
        <h2>Trust</h2>
        <p>
          Built by{' '}
          <a href="https://withciel.com" rel="noopener noreferrer">
            Ciel
          </a>
          . KitsuneOS runs in production as the data layer under Ciel.
        </p>
        <ul>
          <li>
            <a href="https://github.com/withciel/kitsuneos">49 passing acceptance tests</a>
          </li>
          <li>Cross-tenant isolation verified by named Gate 0b tests</li>
        </ul>
      </section>

      <section id="problem">
        <h2>The problem</h2>
        <p>
          Agents write. Postgres assumes human-reviewed code. Teams rebuild staging and approval
          flows badly, over and over.
        </p>
      </section>

      <section id="product">
        <h2>Product</h2>
        <h3>Change sets</h3>
        <p>Every mutation is a proposed change set. Nothing lands without review.</p>
        <h3>Grants</h3>
        <p>Field masks and row predicates restrict what each principal can see or propose.</p>
        <h3>History</h3>
        <p>Every write produces a revision attributed to the acting principal.</p>
      </section>

      <section id="proof">
        <h2>Proof</h2>
        <div className="proof-placeholder" aria-label="Demo video placeholder">
          30-second demo recording — agent proposes next_step, amount rejected, human approves,
          history shows attribution (coming after review UI ships).
        </div>
      </section>

      <section id="limitations">
        <h2>Known limitations</h2>
        <ul>
          <li>Create-only schema in v0.1 — no migrations yet</li>
          <li>No GraphQL layer</li>
          <li>Table-count ceiling per workspace</li>
        </ul>
      </section>

      <section id="close">
        <h2>Get started</h2>
        <p>Sign up and connect your agent with an API key.</p>
        <Link className="cta" href="https://app.kitsuneos.com">
          Create a workspace
        </Link>
      </section>
    </>
  );
}
