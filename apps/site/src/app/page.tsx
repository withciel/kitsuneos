import { contactMailto, earlyAccessMailto, signUpUrl } from '@/lib/urls';

export default function LandingPage() {
  return (
    <main>
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <p className="hero-eyebrow">
            Application database for humans and agents
          </p>
          <h1 id="hero-heading">
            Let agents write your records — without losing control.
          </h1>
          <p className="hero-lede">
            KitsuneOS is the shared workspace where people and agents operate
            the same data. Field-level grants. Propose and review before
            anything lands. One console — not a second system of record.
          </p>
          <div className="hero-actions">
            <a className="cta cta-primary" href={earlyAccessMailto}>
              Request early access
            </a>
            <a className="cta cta-secondary" href={contactMailto}>
              Talk to us
            </a>
          </div>
        </div>

        <div className="hero-media">
          <video
            className="hero-video"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="/kitsune-agents-ad-poster.jpg"
            width={1280}
            height={720}
            aria-label="Product ad: helpers bring work home to one calm place, ready when you need it"
          >
            <source src="/kitsune-agents-ad.mp4" type="video/mp4" />
            {/* biome-ignore lint/performance/noImgElement: native <video> fallback poster */}
            <img
              src="/kitsune-agents-ad.gif"
              alt="Agents writing into a shared company workspace — gathered, reviewable, ready"
              width={1280}
              height={720}
            />
          </video>
        </div>
      </section>

      <section className="band" id="problem">
        <h2>Agents need to write. Your database wasn’t built for that.</h2>
        <p>
          Most stacks assume writes come from reviewed application code. Give an
          agent production access and you risk silent corruption. Keep it
          read-only and you leave most of the value on the table. Staging
          tables, grant hacks, and approval UIs get rebuilt for every app —
          security-critical, and nobody owns them as a product.
        </p>
      </section>

      <section className="band" id="place">
        <h2>One workspace. Equal principals. Review before it sticks.</h2>
        <p>
          KitsuneOS puts authorization and review in the data plane. Humans and
          agents share grants, history, and the same collections. Agents propose
          by default; operators approve in Inbox — beside the tables they
          already use.
        </p>
      </section>

      <section className="band band-triad" id="how" aria-label="How it works">
        <div className="triad">
          <article>
            <h3>Grant</h3>
            <p>
              Scope an agent to the collections and fields it may touch — down
              to the row when you need it.
            </p>
          </article>
          <article>
            <h3>Propose</h3>
            <p>
              Agent writes arrive as reviewable change sets, not silent updates
              to production rows.
            </p>
          </article>
          <article>
            <h3>Review</h3>
            <p>
              Approve or reject in Inbox — same console your team uses to edit
              pages and tables.
            </p>
          </article>
        </div>
      </section>

      <section className="band" id="for">
        <h2>Built for teams connecting agents to real records.</h2>
        <p>
          If you’re wiring agents into accounts, opportunities, or tickets — and
          you refuse a second source of truth — KitsuneOS is the control plane
          you’d otherwise build yourself.
        </p>
      </section>

      <section className="band band-close" id="join">
        <h2>Get early access</h2>
        <p>
          We’re onboarding carefully. Tell us about your team and the agents
          you’re shipping. After you get in: create a database, add a page,
          connect an AI helper, and review its first proposal in Inbox — usually
          in one sitting.
        </p>
        <div className="hero-actions">
          <a className="cta cta-primary" href={earlyAccessMailto}>
            Request early access
          </a>
          <a className="cta cta-secondary" href={signUpUrl}>
            Have an invite? Sign up
          </a>
        </div>
        <p className="band-note">
          Questions? <a href={contactMailto}>support@kitsuneos.com</a>
        </p>
      </section>
    </main>
  );
}
