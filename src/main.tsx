import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { activateBrandFonts } from "./lib/brandFonts";

activateBrandFonts();
createRoot(document.getElementById("root")!).render(<App />);
