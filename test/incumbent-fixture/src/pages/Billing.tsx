import { useState } from "react";
import { Button } from "~/components/ouro/button/button";
import { controls } from "~/generated/web";
import { payNext } from "~/invoices";

export function Billing() {
  const [status, setStatus] = useState("");
  return (
    <section>
      <h1>Billing</h1>
      <Button tone="primary">Update card</Button>
      <Button {...controls["pay-invoice"].props} onClick={() => setStatus(payNext())}>
        {controls["pay-invoice"].label}
      </Button>
      <p role="status">{status}</p>
    </section>
  );
}
