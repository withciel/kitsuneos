import { signInUrl, signUpUrl, acceptanceTestsUrl, gate0bTestsUrl, githubUrl } from '@/lib/urls';

export default function LandingPage() {
  return (
    <main>
      <section className="hero" aria-labelledby="hero-heading">
        <p className="eyebrow">Knowledge warehouse · not an operating system</p>
        <h1 id="hero-heading">
          The governed store of company knowledge agents write into
        </h1>
        <p className="hero-lede">
          KitsuneOS is a knowledge warehouse for AI-native companies: entities,
          records, policies, and agent-writable fields live here with grants,
          change sets, and attributed history — so nothing lands in Postgres or
          internal systems without human review.
        </p>
        <div className="hero-actions">
          <a className="cta cta-primary" href={signUpUrl}>
            Start free
          </a>
          <a className="cta cta-secondary" href="#proof">
            Watch demo
          </a>
          <a className="text-link" href={signInUrl}>
            Sign in
          </a>
        </div>
      </section>

      <nav className="page-nav" aria-label="On this page">
        <a href="#audience">Who it&apos;s for</a>
        <a href="#how">How it works</a>
        <a href="#trust">Security</a>
        <a href="#proof">Proof</a>
        <a href="#pricing">Pricing</a>
        <a href="#limitations">Limits</a>
      </nav>

      <section className="band" id="audience">
        <h2>Who it&apos;s for</h2>
        <p>
          Founders, engineering leads, and AI platform owners at companies
          running agents against real business data — CRM fields, support
          policies, operational records, and anything else agents should
          propose, not push straight into production databases.
        </p>
        <h3>What lives in the warehouse</h3>
        <ul>
          <li>
            <strong>Entities &amp; records</strong> — relational collections
            your agents read and propose updates to
          </li>
          <li>
            <strong>Policies &amp; grants</strong> — field masks and row
            predicates per principal (human or agent)
          </li>
          <li>
            <strong>Change sets</strong> — staged mutations awaiting review
          </li>
          <li>
            <strong>Revision history</strong> — every applied write attributed
            to the acting principal
          </li>
        </ul>
      </section>

      <section className="band" id="how">
        <h2>How it works</h2>
        <ol className="steps">
          <li>
            <strong>Propose</strong> — agents (or humans) submit field-level
            change sets through MCP; grants decide what they can touch
          </li>
          <li>
            <strong>Review</strong> — your team inspects the diff in the inbox;
            rejected fields never apply
          </li>
          <li>
            <strong>Apply</strong> — approved changes land atomically as a
            change set
          </li>
          <li>
            <strong>History</strong> — revisions record who acted, including
            agent principals
          </li>
        </ol>
        <p>
          Compared with raw Postgres or a RAG dump: permissions live on the
          data, writes are reviewable by default, and provenance is built in —
          not bolted on after an incident.
        </p>
      </section>

      <section className="band" id="trust">
        <h2>Security &amp; trust</h2>
        <p>
          Built by{' '}
          <a href="https://withciel.com" rel="noopener noreferrer">
            Ciel
          </a>
          . KitsuneOS powers Ciel&apos;s own agent workflows today; the hosted
          product is in{' '}
          <a href="/terms/">early access</a> — use it for evaluation and
          non-production workloads until we announce general availability (see{' '}
          <a href="/terms/">Terms</a>).
        </p>
        <ul>
          <li>
            Workspaces are isolated; cross-tenant access returns{' '}
            <em>not found</em>, never a distinguishable forbidden
          </li>
          <li>
            Auth via WorkOS; billing via Dodo Payments; hosted on AWS (RDS, App
            Runner, S3, CloudFront)
          </li>
          <li>
            <a href={acceptanceTestsUrl}>110+ acceptance tests</a> in the{' '}
            <a href={githubUrl}>KitsuneOS repository</a>
          </li>
          <li>
            Cross-tenant isolation covered by{' '}
            <a href={gate0bTestsUrl}>Gate 0b tests</a> in the acceptance suite
            (named isolation scenarios, including HTTP MCP)
          </li>
        </ul>
      </section>

      <section className="band" id="proof">
        <h2>Proof</h2>
        <p>
          Thirty-second walkthrough: an agent proposes <code>next_step</code>,
          <code>amount</code> is rejected by grants, a human approves in the
          inbox, and history shows agent attribution.
        </p>
        <div className="proof-frame">
          <video
            className="proof-video"
            controls
            preload="metadata"
            poster="/proof-poster.svg"
            width={960}
            height={540}
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
        </div>
      </section>

      <section className="band" id="pricing">
        <h2>Pricing &amp; early access</h2>
        <p>
          KitsuneOS is in early access. Create a workspace free while we refine
          the product; paid subscriptions will apply at general availability.
          Need a team rollout or have billing questions?{' '}
          <a href="mailto:support@kitsuneos.com">support@kitsuneos.com</a>.
        </p>
        <p>
          Refunds for paid plans are described on our{' '}
          <a href="/refund/">Refund policy</a> page.
        </p>
      </section>

      <section className="band" id="limitations">
        <h2>Known limitations</h2>
        <p>We ship what exists today — no vapor features.</p>
        <ul>
          <li>Create-only schema in v0.1 — no migrations yet</li>
          <li>No hosted GraphQL API (MCP and REST-style console APIs)</li>
          <li>Table-count ceiling per workspace</li>
          <li>No independent security audit yet (see Terms)</li>
        </ul>
      </section>

      <section className="band band-close" id="close">
        <h2>Start your warehouse</h2>
        <p>
          Sign up with WorkOS, provision a workspace, and connect your agent
          with an API key.
        </p>
        <a className="cta cta-primary" href={signUpUrl}>
          Start free
        </a>
      </section>
    </main>
  );
}
