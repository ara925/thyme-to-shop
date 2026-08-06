const DEFAULT_SITE_ORIGIN = "https://placeinthyme.com";

function getSiteOrigin() {
  const configuredOrigin = import.meta.env.VITE_SITE_URL?.trim();

  try {
    const url = new URL(configuredOrigin || DEFAULT_SITE_ORIGIN);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return DEFAULT_SITE_ORIGIN;
    }

    return url.origin;
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

export const SITE_ORIGIN = getSiteOrigin();
export const SOCIAL_IMAGE_URL = new URL("/favicon.png", `${SITE_ORIGIN}/`).toString();
