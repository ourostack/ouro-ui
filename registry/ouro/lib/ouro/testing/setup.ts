import { afterEach, beforeEach } from "vitest";

// Vitest setup for Ouro UI's browser tests: test output stays clean, so anything a test
// writes to the console fails that test: a React act() warning, a development message from
// Ouro UI or Base UI, a stray console.log. A test that expects a message mocks the method
// (`vi.spyOn(console, "warn").mockImplementation(() => {})`) and asserts on the mock, so
// nothing is printed. Updates happen outside act by design (real browser events), so the act
// environment is off except inside the `act` helper (testing/act.ts). The app's stylesheet
// is a separate setup file (testing/vitest.ts).

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

/**
 * A browser reports "ResizeObserver loop completed with undelivered notifications" as a window
 * error when a resize callback changes layout, as a measuring component does (Base UI's toast,
 * a TextArea that grows). It is a notice about timing, not a failure. Vitest prints it with
 * `console.error(new Error(message))`; that one call is dropped, so it neither prints nor fails.
 */
const isResizeNotice = (value: unknown) => String((value as { message?: unknown } | null | undefined)?.message ?? "").startsWith("ResizeObserver loop");

const methods = ["debug", "log", "info", "warn", "error"] as const;
const seen: string[] = [];
for (const method of methods) {
  const original = console[method];
  console[method] = (...args: unknown[]) => {
    if (isResizeNotice(args[0])) return;
    seen.push(`console.${method}: ${args.map(String).join(" ").split("\n")[0]!}`);
    original.apply(console, args);
  };
}

beforeEach(() => {
  seen.length = 0;
});

afterEach(() => {
  if (seen.length > 0) {
    const messages = seen.splice(0);
    throw new Error(
      `Console output in this test (test output must stay clean; mock the console method if the message is expected):\n${messages.join("\n")}`,
    );
  }
});
