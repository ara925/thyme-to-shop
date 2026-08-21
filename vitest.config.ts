import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  define: {
    'import.meta.env.VITE_DELIVERY_WINDOWS_JSON': JSON.stringify(JSON.stringify([
      { value: '9am-11am', label: 'Monday, 9:00 AM – 11:00 AM' },
      { value: '11am-1pm', label: 'Monday, 11:00 AM – 1:00 PM' },
      { value: '1pm-3pm', label: 'Tuesday, 1:00 PM – 3:00 PM' },
      { value: '3pm-5pm', label: 'Tuesday, 3:00 PM – 5:00 PM' },
      { value: '5pm-7pm', label: 'Tuesday, 5:00 PM – 7:00 PM' },
    ])),
    'import.meta.env.VITE_PICKUP_WINDOWS_JSON': JSON.stringify(JSON.stringify([
      { value: 'pickup-10am-12pm', label: '10:00 AM – 12:00 PM' },
      { value: 'pickup-12pm-2pm', label: '12:00 PM – 2:00 PM' },
      { value: 'pickup-2pm-4pm', label: '2:00 PM – 4:00 PM' },
    ])),
    'import.meta.env.VITE_ENABLE_PICKUP': JSON.stringify('false'),
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
