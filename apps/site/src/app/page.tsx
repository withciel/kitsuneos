export default function LandingPage() {
  return (
    <>
      <header className="hero">
        <p className="hero-brand">
          Kitsune<span>OS</span>
        </p>
        <h1>Agents propose. You approve.</h1>
        <p>
          A database layer where agent writes arrive as reviewable change sets —
          with field grants, attributed history, and nothing landing until you
          say so.
        </p>
        <a className="cta" href="[REDACTED]">
          Start free
        </a>
      </header>

      <section className="band" id="trust">
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
            <a
              href="https://github.com/withciel/kitsuneos"
              aria-label="KitsuneOS on GitHub — 60 passing acceptance tests"
            >
              60 passing acceptance tests
            </a>
          </li>
          <li>Cross-tenant isolation verified by named Gate 0b tests</li>
        </ul>
      </section>

      <section className="band" id="problem">
        <h2>The problem</h2>
        <p>
          Agents write. Postgres assumes human-reviewed code. Teams rebuild
          staging and approval flows badly, over and over.
        </p>
      </section>

      <section className="band" id="product">
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

      <section className="band" id="proof">
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

      <section className="band" id="limitations">
        <h2>Known limitations</h2>
        <ul>
          <li>Create-only schema in v0.1 — no migrations yet</li>
          <li>No GraphQL layer</li>
          <li>Table-count ceiling per workspace</li>
        </ul>
      </section>

      <section className="band" id="close">
        <h2>Get started</h2>
        <p>Sign up and connect your agent with an API key.</p>
        <a className="cta" href="[REDACTED]">
          Create a workspace
        </a>
      </section>
    </>
  );
}
