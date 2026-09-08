import { LANDING } from '@/lib/landing-copy';
import { contactMailto, signInUrl, signUpUrl } from '@/lib/urls';

export default function LandingPage() {
  return (
    <main>
      <section className="hero" aria-labelledby="hero-heading">
        <div className="hero-stage" aria-hidden="true">
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
              alt="Agents writing into a shared company workspace: gathered, reviewable, ready"
              width={1280}
              height={720}
            />
          </video>
        </div>
        <div className="hero-copy">
          <p className="hero-brand">
            Kitsune<span className="hero-brand-os">OS</span>
          </p>
          <h1 id="hero-heading">{LANDING.hero.heading}</h1>
          <p className="hero-lede">{LANDING.hero.lede}</p>
          <div className="hero-actions">
            <a className="cta cta-primary" href={signUpUrl}>
              {LANDING.ctaPrimary}
            </a>
            <a className="cta cta-text" href={signInUrl}>
              {LANDING.ctaSecondary}
            </a>
          </div>
        </div>
      </section>

      <section className="band band-trust" id="trust" aria-label="Trust">
        <p>{LANDING.trust}</p>
      </section>

      <section className="band" id="problem">
        <h2>{LANDING.problem.heading}</h2>
        <p>{LANDING.problem.body}</p>
      </section>

      <section className="band" id="place">
        <h2>{LANDING.place.heading}</h2>
        <p>{LANDING.place.body}</p>
      </section>

      <section className="band band-how" id="how" aria-labelledby="how-heading">
        <h2 id="how-heading">{LANDING.how.heading}</h2>
        <ol className="how-steps">
          {LANDING.how.steps.map((step) => (
            <li key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="band" id="for">
        <h2>{LANDING.forWhom.heading}</h2>
        <p>{LANDING.forWhom.body}</p>
      </section>

      <section className="band band-close" id="join">
        <h2>{LANDING.join.heading}</h2>
        <p>{LANDING.join.body}</p>
        <div className="hero-actions">
          <a className="cta cta-primary" href={signUpUrl}>
            {LANDING.joinPrimary}
          </a>
          <a className="cta cta-text" href={signInUrl}>
            {LANDING.ctaSecondary}
          </a>
        </div>
        <p className="band-note">
          Questions? <a href={contactMailto}>support@kitsuneos.com</a>
        </p>
      </section>
    </main>
  );
}
