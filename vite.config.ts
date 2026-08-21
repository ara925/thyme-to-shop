import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const DEFAULT_SITE_URL = "https://shop.placeinthyme.com";

function resolveSiteUrl(value?: string) {
  const candidate = (value || DEFAULT_SITE_URL).trim();
  const url = new URL(candidate);

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('VITE_SITE_URL must be an absolute HTTP(S) URL without credentials, a query, or a hash.');
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function siteUrlHtmlPlugin(siteUrl: string): Plugin {
  return {
    name: "place-in-thyme-site-url",
    transformIndexHtml: {
      order: "pre",
      handler: (html) => html.replaceAll("%PLACE_IN_THYME_SITE_URL%", siteUrl),
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const siteUrl = resolveSiteUrl(env.VITE_SITE_URL);

  return {
    define: {
      'import.meta.env.VITE_SITE_URL': JSON.stringify(siteUrl),
    },
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [siteUrlHtmlPlugin(siteUrl), react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
