import "./index.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Billing } from "~/pages/Billing";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Billing />
  </StrictMode>,
);
