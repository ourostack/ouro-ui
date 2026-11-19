import "@mantine/core/styles.css";
import "./index.css";
import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Settings } from "~/pages/Settings";
import { XRay } from "~/xray";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MantineProvider>
      <Settings />
      <XRay />
    </MantineProvider>
  </StrictMode>,
);
