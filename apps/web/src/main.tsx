import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { AppProviders } from "./app/providers";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-800.css";
import "@fontsource/roboto-mono/latin-400.css";
import "@fontsource/roboto-mono/latin-500.css";
import "@fontsource/roboto-mono/latin-600.css";
import "./shared/styles/globals.css";
import "./features/ops/ops.css";
import "./features/ops/pages.css";
import "./features/ops/enterprise.css";
import "./features/ops/glass.css";

createRoot(document.getElementById("root")!).render(<StrictMode><AppProviders><App /></AppProviders></StrictMode>);
