import { Button, Modal, Select, Switch, TextInput } from "@mantine/core";
import { useState } from "react";
import { controls } from "~/generated/web";
import { payNext } from "~/invoices";

export function Settings() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("");
  return (
    <section>
      <h1>Settings</h1>
      <TextInput label="Display name" />
      <Select label="Language" data={["English", "Français"]} />
      <Switch label="Email me about changes" />
      <Button {...controls["pay-invoice"].props} onClick={() => setStatus(payNext())}>{controls["pay-invoice"].label}</Button>
      <p role="status">{status}</p>
      <Button color="blue.8" onClick={() => setOpen(true)}>Delete account</Button>
      <Modal opened={open} onClose={() => setOpen(false)} title="Delete account">
        <Button color="red.8">Delete</Button>
      </Modal>
    </section>
  );
}
