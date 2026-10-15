import { createRoot, hydrateRoot } from "react-dom/client";
import "./fonts.css";
import "../app/globals.css";
import "../app/home.css";
import { App } from "./app";

const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, <App />);
else createRoot(root).render(<App />);
