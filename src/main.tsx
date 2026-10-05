// src/main.tsx

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./styles/globals.css";
import "leaflet/dist/leaflet.css";

import App from "./App";
import { startTableFit } from "./lib/tableFit";

// Every board decides for itself whether its rows fit (see lib/tableFit.ts).
startTableFit();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);