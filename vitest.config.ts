import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  define: {
    'import.meta.env.VITE_SHOPIFY_LOCAL_FULFILLMENT_READY': JSON.stringify('true'),
    'import.meta.env.VITE_DELIVERY_WINDOWS_JSON': JSON.stringify(JSON.stringify([
      { value: 'monday', label: 'Monday' },
      { value: 'tuesday', label: 'Tuesday' },
    ])),
    'import.meta.env.VITE_PICKUP_WINDOWS_JSON': JSON.stringify(JSON.stringify([
      { value: 'monday-after-9am', label: 'Monday after 9:00 AM' },
    ])),
    'import.meta.env.VITE_ENABLE_PICKUP': JSON.stringify('true'),
  },
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
