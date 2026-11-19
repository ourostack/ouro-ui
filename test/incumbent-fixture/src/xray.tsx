import { useState } from "react";
import { Inspector } from "~/components/ouro/inspector/inspector";

export function XRay() {
  const [open, setOpen] = useState(() => new URLSearchParams(location.search).has("xray"));
  return <Inspector open={open} onOpenChange={setOpen} />;
}
