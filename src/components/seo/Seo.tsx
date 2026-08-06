import { useEffect } from "react";
import { SITE_ORIGIN, SOCIAL_IMAGE_URL } from "./siteConfig";

type JsonLd = Record<string, unknown>;

interface SeoProps {
  title: string;
  description: string;
  canonicalPath?: string;
  noIndex?: boolean;
  openGraphType?: "website" | "product";
  jsonLd?: JsonLd;
  imageUrl?: string;
  imageAlt?: string;
}

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  element.content = content;
}

function setCanonical(canonicalUrl?: string) {
  let element = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (!canonicalUrl) {
    element?.remove();
    return;
  }

  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }

  element.href = canonicalUrl;
}

function setJsonLd(jsonLd?: JsonLd) {
  const scriptId = "route-json-ld";
  const existingScripts = Array.from(
    document.head.querySelectorAll<HTMLScriptElement>(
      `#${scriptId}, script[type="application/ld+json"][data-static-seo]`,
    ),
  );

  if (!jsonLd) {
    existingScripts.forEach((script) => script.remove());
    return;
  }

  let script = existingScripts[0];
  if (!script) {
    script = document.createElement("script");
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  existingScripts.slice(1).forEach((duplicate) => duplicate.remove());
  script.id = scriptId;
  script.removeAttribute("data-static-seo");
  script.textContent = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
}

function getCanonicalUrl(path: string) {
  const url = new URL(SITE_ORIGIN);
  url.pathname = path.startsWith("/") ? path : `/${path}`;
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function Seo({
  title,
  description,
  canonicalPath,
  noIndex = false,
  openGraphType = "website",
  jsonLd,
  imageUrl = SOCIAL_IMAGE_URL,
  imageAlt = "Place in Thyme",
}: SeoProps) {
  useEffect(() => {
    const canonicalUrl = canonicalPath ? getCanonicalUrl(canonicalPath) : undefined;
    document.title = title;
    upsertMeta("name", "description", description);
    upsertMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow");

    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:type", openGraphType);
    upsertMeta("property", "og:site_name", "Place in Thyme");
    upsertMeta("property", "og:image", imageUrl);
    upsertMeta("property", "og:image:alt", imageAlt);

    if (canonicalUrl) {
      upsertMeta("property", "og:url", canonicalUrl);
    } else {
      document.head.querySelector('meta[property="og:url"]')?.remove();
    }

    upsertMeta("name", "twitter:card", openGraphType === "product" ? "summary_large_image" : "summary");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:image", imageUrl);
    upsertMeta("name", "twitter:image:alt", imageAlt);

    setCanonical(canonicalUrl);
    setJsonLd(jsonLd);
  }, [canonicalPath, description, imageAlt, imageUrl, jsonLd, noIndex, openGraphType, title]);

  return null;
}
