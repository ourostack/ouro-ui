import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Billing } from "~/pages/Billing";
import { XRay } from "~/xray";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Billing />
    <XRay />
  </StrictMode>,
);
