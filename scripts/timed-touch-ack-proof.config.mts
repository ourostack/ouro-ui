import { appendFileSync } from "node:fs";
import type { BrowserContext, CDPSession, Page } from "playwright";
import type { BrowserCommand } from "vitest/node";
import { touchDrag as currentTouchDrag, type TouchDragOptions } from "../registry/ouro/lib/ouro/testing/commands.ts";
import { touchDrag as originalTouchDrag } from "../.tmp/touch-legacy/registry/ouro/lib/ouro/testing/commands.ts";
import base from "../vitest.config.ts";

declare global {
  interface Window {
    __ouroAckTrace?: { rows: Array<Record<string, unknown>>; stop: () => void };
  }
}

interface TouchInput {
  type: string;
  timestamp?: number;
  touchPoints: unknown[];
}
interface Packet {
  input: TouchInput;
  sent: number;
  nativeAck?: number;
  returned?: number;
}
interface State {
  target: boolean;
  packets: Packet[];
}

function isTouchInput(value: unknown): value is TouchInput {
  return typeof value === "object" && value !== null && "type" in value &&
    typeof value.type === "string" && "touchPoints" in value && Array.isArray(value.touchPoints) &&
    (!("timestamp" in value) || value.timestamp === undefined || typeof value.timestamp === "number");
}

const profile = process.env["TOUCH_ACK_PROFILE"];
if (profile !== "original" && profile !== "fixed") throw new Error("TOUCH_ACK_PROFILE must be original or fixed.");
const path = process.env["TOUCH_ACK_TRACE_FILE"];
if (!path) throw new Error("TOUCH_ACK_TRACE_FILE must name retained native evidence.");
const selected = profile === "original" ? originalTouchDrag : currentTouchDrag;
const states = new WeakMap<Page, State>();
const installed = new WeakSet<BrowserContext>();
const ackDelayMs = 650; // A transport reply delayed past Base UI's 500ms long-press deadline.

const observedTouchDrag: BrowserCommand<[TouchDragOptions]> = async (ctx, options) => {
  const context = ctx.page.context();
  if (!installed.has(context)) {
    const create = context.newCDPSession.bind(context);
    context.newCDPSession = async (target) => {
      const session = await create(target);
      const page = "page" in target ? target.page() : target;
      const send = session.send.bind(session);
      const observedSend: CDPSession["send"] = async (method, params) => {
        const state = states.get(page);
        const packet: Packet | undefined = state?.target && method === "Input.dispatchTouchEvent" && isTouchInput(params)
          ? { input: params, sent: Date.now() } : undefined;
        if (packet && state) state.packets.push(packet);
        const reply = await send(method, params);
        if (packet) {
          packet.nativeAck = Date.now();
          if (packet.input.type === "touchStart") await new Promise((resolve) => setTimeout(resolve, ackDelayMs));
          packet.returned = Date.now();
        }
        return reply;
      };
      session.send = observedSend;
      return session;
    };
    installed.add(context);
  }
  const target = options.durationMs === 600 && options.steps === 10 &&
    options.to[0] - options.from[0] === -40 && options.to[1] === options.from[1];
  const state: State = { target, packets: [] };
  states.set(ctx.page, state);
  if (target) {
    await ctx.iframe.locator("body").evaluate(() => {
      const rows: Array<Record<string, unknown>> = [];
      const record = (event: Event) => {
        const point = event instanceof PointerEvent ? { x: event.clientX, y: event.clientY } :
          event instanceof TouchEvent ? { changed: [...event.changedTouches].map((touch) => ({ x: touch.clientX, y: touch.clientY })) } : {};
        rows.push({ kind: event.type, now: performance.now(), wall: Date.now(), timestamp: event.timeStamp, trusted: event.isTrusted, ...point });
      };
      const events = ["pointerdown", "pointermove", "pointerup", "pointercancel", "touchstart", "touchmove", "touchend"];
      for (const type of events) document.addEventListener(type, record, { capture: true, passive: true });
      let menu = false;
      const observer = new MutationObserver(() => {
        const next = document.querySelector('[role="menu"]') !== null;
        if (next !== menu) rows.push({ kind: "menu", now: performance.now(), wall: Date.now(), open: next });
        menu = next;
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role"] });
      window.__ouroAckTrace = {
        rows,
        stop: () => {
          for (const type of events) document.removeEventListener(type, record, true);
          observer.disconnect();
        },
      };
    });
  }
  try {
    await selected(ctx, options);
  } finally {
    state.target = false;
    if (target) {
      const dom = await ctx.iframe.locator("body").evaluate(() => {
        const trace = window.__ouroAckTrace;
        if (!trace) throw new Error("The native ACK observation was not installed.");
        trace.stop();
        delete window.__ouroAckTrace;
        return {
          rows: trace.rows,
          menu: document.querySelector('[role="menu"]')?.textContent ?? null,
          dragging: [...document.querySelectorAll('[data-ouro="swipe-actions"]')].map((row) => row.hasAttribute("data-dragging")),
        };
      });
      appendFileSync(path, `${JSON.stringify({
        profile, candidate: "7309c9d2e15a18024115b0df690e281e8d87efa4",
        original: "0e61ad49e9faebd40bc2815e33bc6a9de27f0c17",
        proofSource: process.env["TOUCH_ACK_PROOF_SOURCE"],
        ackDelayMs, options, packets: state.packets, dom,
      })}\n`);
    }
  }
};

export default {
  ...base,
  test: {
    ...base.test,
    reporters: ["default", "json"],
    outputFile: { json: process.env["TOUCH_ACK_RESULT_FILE"] },
    projects: base.test!.projects!.map((project) => {
      if (typeof project !== "object" || !("test" in project)) throw new Error("This proof requires the existing browser projects.");
      return {
        ...project,
        test: {
          ...project.test,
          browser: {
            ...project.test?.browser,
            commands: { ...project.test?.browser?.commands, touchDrag: observedTouchDrag },
          },
        },
      };
    }),
  },
};
