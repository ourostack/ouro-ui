// Source stand-in for the code that offers a bundle's declared tools: a consequential declaration waits for approval.
interface Declared { ax: { effect: string } }

export function offer(declared: Declared | undefined) {
  return {
    handler: () => "done",
    ...(declared?.ax.effect === "consequential"
      ? { approvalPolicy: () => ({ kind: "required" }) }
      : {}),
  };
}

export function offerByIf(declared: Declared) {
  const definition: Record<string, unknown> = { handler: () => "done" };
  if (declared.ax.effect === "consequential") definition.approvalPolicy = () => ({ kind: "required" });
  return definition;
}

export function offerWrongEffect(declared: Declared) {
  return { ...(declared.ax.effect === "write" ? { approvalPolicy: () => ({ kind: "required" }) } : {}) };
}

export function offerAlways() {
  return { approvalPolicy: () => ({ kind: "required" }), effect: "consequential" };
}

export function offerNothing() {
  return { handler: () => "done" };
}
