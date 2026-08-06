import { useLocation } from "react-router-dom";
import { Seo } from "./Seo";
import { SITE_ORIGIN, SOCIAL_IMAGE_URL } from "./siteConfig";
import routeMetadata from "../../../route-metadata.json";

interface RouteMetadata {
  title: string;
  description: string;
  noIndex?: boolean;
}

const STATIC_ROUTE_METADATA = routeMetadata as Record<string, RouteMetadata>;

const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Place in Thyme",
  url: SITE_ORIGIN,
  logo: SOCIAL_IMAGE_URL,
  email: "info@placeinthyme.com",
};

export function RouteSeo() {
  const { pathname } = useLocation();
  const normalizedPath = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  const metadata = STATIC_ROUTE_METADATA[normalizedPath];
  const isProductRoute = normalizedPath.startsWith("/product/");
  const organizationJsonLd = normalizedPath === "/" ? ORGANIZATION_JSON_LD : undefined;

  if (metadata) {
    return (
      <Seo
        title={metadata.title}
        description={metadata.description}
        canonicalPath={normalizedPath}
        noIndex={metadata.noIndex}
        jsonLd={organizationJsonLd}
      />
    );
  }

  if (isProductRoute) {
    return null;
  }

  return (
    <Seo
      title="Page Not Found | Place in Thyme"
      description="The requested page could not be found."
      noIndex
    />
  );
}
