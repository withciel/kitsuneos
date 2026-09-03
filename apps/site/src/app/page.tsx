import Link from 'next/link';

export default function LandingPage() {
  return (
    <>
      <header className="hero">
        <h1>Agents propose. You approve.</h1>
        <p>
          KitsuneOS is a database layer where agents propose changes and humans
          approve them before anything lands.
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
          .
        </p>
        <ul>
          <li>
            <a
              href="https://github.com/withciel/kitsuneos"
              aria-label="KitsuneOS on GitHub — 87 passing acceptance tests"
            >
              87 passing acceptance tests
            </a>
          </li>
          <li>Cross-tenant isolation verified by named Gate 0b tests</li>
        </ul>
      </section>

      <section id="problem">
        <h2>The problem</h2>
        <p>
          Agents write. Postgres assumes human-reviewed code. Teams rebuild
          staging and approval flows badly, over and over.
        </p>
      </section>

      <section id="product">
        <h2>Product</h2>
        <h3>Change sets</h3>
        <p>
          Every mutation is a proposed change set. Nothing lands without review.
        </p>
        <h3>Grants</h3>
        <p>
          Field masks and row predicates restrict what each principal can see or
          propose.
        </p>
        <h3>History</h3>
        <p>
          Every write produces a revision attributed to the acting principal.
        </p>
      </section>

      <section id="proof">
        <h2>Proof</h2>
        <video
          className="proof-video"
          controls
          preload="metadata"
          poster="/proof-poster.svg"
          aria-label="Demo: agent proposes next_step, amount rejected, human approves, history shows attribution"
        >
          <source src="/proof-demo.mp4" type="video/mp4" />
          <track
            kind="captions"
            src="/proof-demo.vtt"
            srcLang="en"
            label="English"
            default
          />
          <p>
            30-second demo: agent proposes <code>next_step</code>,{' '}
            <code>amount</code> rejected, human approves in the review queue,
            history shows agent attribution.
          </p>
        </video>
      </section>

      <section id="limitations">
        <h2>Known limitations</h2>
        <ul>
          <li>
            Schema evolution is add / drop / index only — no retype or rename
          </li>
          <li>No semantic search and no attachments</li>
          <li>Table-count ceiling per workspace</li>
          <li>
            Hosted console is the product; <code>pnpm quickstart</code> is
            eval-only, not a production self-host
          </li>
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
