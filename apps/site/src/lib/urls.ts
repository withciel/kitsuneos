const defaultAppHost = 'app.kitsuneos.com';
const defaultSiteHost = 'kitsuneos.com';

function originFromEnv(
  envValue: string | undefined,
  defaultHost: string,
): string {
  if (envValue) {
    return envValue;
  }
  return `https://${defaultHost}`;
}

/** Marketing site links to the hosted console. Overridable at build time. */
export const APP_ORIGIN = originFromEnv(
  process.env.NEXT_PUBLIC_APP_ORIGIN,
  defaultAppHost,
);

export const SITE_ORIGIN = originFromEnv(
  process.env.NEXT_PUBLIC_SITE_ORIGIN,
  defaultSiteHost,
);

export const signInUrl = `${APP_ORIGIN}/login`;
export const signUpUrl = `${APP_ORIGIN}/signup`;

export const earlyAccessMailto =
  'mailto:support@kitsuneos.com?subject=Early%20access';
export const contactMailto = 'mailto:support@kitsuneos.com';
export const cielUrl = 'https://withciel.com';
export const githubUrl = 'https://github.com/withciel/kitsuneos';
