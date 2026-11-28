import { useCallback, useRef, useState, type JSX } from "react";
import { TextArea } from "@/registry/ouro/components/ouro/text-field/text-area";
import { Button } from "@/registry/ouro/components/ouro/button/button";
import { useRestingCaret } from "@/registry/ouro/lib/ouro/use-resting-caret";

// The live demo at the top of docs/text-area/: the component as an app would use it, with its props, nothing else.

export default function TextAreaDemo(): JSX.Element {
  const [box, setBox] = useState<HTMLTextAreaElement | null>(null);
  const wake = useRef<() => void>(() => {});
  const [covered, setCovered] = useState(false);
  const [held, setHeld] = useState(false);
  const subscribeWake = useCallback((listener: () => void) => {
    wake.current = listener;
    return () => { wake.current = () => {}; };
  }, []);
  const onHeld = useCallback((value: boolean) => {
    setHeld(value);
    if (!value) setCovered(false);
  }, []);
  useRestingCaret(box, { enabled: covered, occluded: covered, subscribeWake, onHeld }, false, false);
  return (
    <div className="grid w-full max-w-sm gap-4">
      <TextArea
        ref={setBox}
        label="A thought worth keeping"
        name="message"
        autoGrow
        rows={2}
        maxRows={6}
        defaultValue="Leave a little room for a good idea."
        description={held ? "Quiet while you read. Just start typing to continue." : "Try a quiet caret. Keep writing whenever you're ready."}
      />
      <div>
        <Button
          variant="outline"
          tone="secondary"
          size="sm"
          style={{ visibility: held ? "hidden" : "visible" }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            box!.focus({ preventScroll: true });
            if (held) wake.current();
            setCovered(!held);
          }}
        >
          Try quiet reading
        </Button>
      </div>
    </div>
  );
}
