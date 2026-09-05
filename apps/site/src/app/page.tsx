import { contactMailto, earlyAccessMailto } from '@/lib/urls';

export default function LandingPage() {
  return (
    <main>
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-copy">
          <h1 id="hero-heading">Everything your team knows, close at hand.</h1>
          <p className="hero-lede">
            Stop hunting for what you already decided. KitsuneOS is where your
            company’s knowing lives — gathered, remembered, ready.
          </p>
          <div className="hero-actions">
            <a className="cta cta-primary" href={earlyAccessMailto}>
              Join early access
            </a>
            <a className="cta cta-secondary" href={contactMailto}>
              Contact
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
            aria-label="Product ad: helpers quietly bring knowing home, it gathers in one calm place, stays ready when you need it"
          >
            <source src="/kitsune-agents-ad.mp4" type="video/mp4" />
            <img
              src="/kitsune-agents-ad.gif"
              alt="Helpers writing into company knowledge — it gathers, stays, ready when you need it"
              width={1280}
              height={720}
            />
          </video>
        </div>
      </section>

      <section className="band" id="scatter">
        <h2>Knowing used to live everywhere.</h2>
        <p>
          In chats. In docs no one opens. In someone’s head on a Tuesday. Help
          arrived fast — but the memory of what you decided didn’t.
        </p>
      </section>

      <section className="band" id="place">
        <h2>KitsuneOS is that place.</h2>
        <p>
          The knowledge home for companies that work with AI. What your team
          knows stays close. Easy to find. Still there when the next question
          comes.
        </p>
      </section>

      <section className="band band-triad" id="how" aria-label="How it feels">
        <div className="triad">
          <article>
            <h3>Gather</h3>
            <p>Quiet helpers bring what they learn back home.</p>
          </article>
          <article>
            <h3>Remember</h3>
            <p>Decisions stay put — not scattered across tools.</p>
          </article>
          <article>
            <h3>Make room</h3>
            <p>Space for what matters next, without losing what came before.</p>
          </article>
        </div>
      </section>

      <section className="band band-close" id="join">
        <h2>Join early access</h2>
        <p>
          We’re opening carefully. Tell us about your team — we’ll make room.
        </p>
        <div className="hero-actions">
          <a className="cta cta-primary" href={earlyAccessMailto}>
            Join early access
          </a>
          <a className="cta cta-secondary" href={contactMailto}>
            support@kitsuneos.com
          </a>
        </div>
      </section>
    </main>
  );
}
