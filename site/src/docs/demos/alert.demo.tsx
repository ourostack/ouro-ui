import { useState, type JSX } from "react";
import { Alert } from "@/registry/ouro/components/ouro/alert/alert";
import { Button } from "@/registry/ouro/components/ouro/button/button";

// The live demo at the top of docs/alert/: the component as an app would use it, with its props, nothing else.

export default function AlertDemo(): JSX.Element {
  const [error, setError] = useState(true);
  return (
    <div className="grid max-w-md gap-3">
      <Alert tone="success" title="Recipe saved" description="It's in your cookbook now." />
      {error ? (
        <Alert
          tone="destructive"
          title="Couldn't save"
          description="Check your connection and try again."
          action={
            <Button size="sm" tone="destructive" variant="soft" onClick={() => setError(false)}>
              Try again
            </Button>
          }
          onDismiss={() => setError(false)}
        />
      ) : (
        <Button variant="outline" tone="secondary" onClick={() => setError(true)}>
          Show the error again
        </Button>
      )}
    </div>
  );
}
