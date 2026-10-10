import distCss from "../../../dist/styles.css?raw";
import { act, type ReactNode, type SVGProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { commands, page, userEvent } from "vitest/browser";
import { OuroProvider, type OuroLinkComponent } from "../../provider/OuroProvider.tsx";
import { Button } from "./Button.tsx";

// Reads the built dist/styles.css, so run `pnpm build` first.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
let mounted: Element[] = [];

function addStyle(css: string) {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  mounted.push(style);
}

async function render(node: ReactNode) {
  const host = document.createElement("div");
  document.body.append(host);
  mounted.push(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(node));
  return {
    host,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    get button() {
      return host.querySelector<HTMLElement>("[data-ouro]")!;
    },
  };
}

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  addStyle(distCss);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  for (const node of mounted) node.remove();
  mounted = [];
  await commands.emulateMedia({ reducedMotion: "no-preference" });
});

const Star = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 16 16" data-testid="icon" {...props}>
    <path d="M8 1l2 5h5l-4 3 2 6-5-4-5 4 2-6-4-3h5z" />
  </svg>
);

describe("button branch", () => {
  it("renders a native button with type=button and data-ouro", async () => {
    const { button } = await render(<Button>Go</Button>);
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
    expect(button.getAttribute("data-ouro")).toBe("button");
    expect(button.textContent).toBe("Go");
  });

  it("passes type, onClick and other button attributes through", async () => {
    const onClick = vi.fn();
    const { button } = await render(
      <Button type="submit" onClick={onClick} aria-label="Send now" name="intent" value="send">
        Send
      </Button>,
    );
    expect(button.getAttribute("type")).toBe("submit");
    expect(button.getAttribute("aria-label")).toBe("Send now");
    expect(button.getAttribute("name")).toBe("intent");
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("forwards a ref to the button element", async () => {
    let element: HTMLButtonElement | null = null;
    await render(
      <Button
        ref={(node) => {
          element = node;
        }}
      >
        Go
      </Button>,
    );
    expect(element).toBeInstanceOf(HTMLButtonElement);
  });

  it("disables natively with disabled and fades", async () => {
    const onClick = vi.fn();
    const { button } = await render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(getComputedStyle(button).opacity).toBe("0.5");
    button.click();
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders start and end icons, hidden from assistive technology", async () => {
    const { host } = await render(
      <Button startIcon={Star} endIcon={Star}>
        Star
      </Button>,
    );
    const icons = host.querySelectorAll('[data-testid="icon"]');
    expect(icons).toHaveLength(2);
    for (const icon of icons) expect(icon.getAttribute("aria-hidden")).toBe("true");
  });

  it("stretches to its container with fullWidth", async () => {
    const { host, button } = await render(
      <div style={{ width: 300 }}>
        <Button fullWidth>Go</Button>
      </div>,
    );
    expect(host.firstElementChild!.getBoundingClientRect().width).toBe(300);
    expect(button.getBoundingClientRect().width).toBe(300);
  });
});

describe("loading", () => {
  it("sets aria-busy, disables without losing focus, and keeps the width within 1px", async () => {
    const onClick = vi.fn();
    const screen = await render(
      <Button onClick={onClick} startIcon={Star}>
        Save recipe
      </Button>,
    );
    const button = screen.button as HTMLButtonElement;
    button.focus();
    const before = button.getBoundingClientRect();
    await screen.rerender(
      <Button onClick={onClick} startIcon={Star} loading>
        Save recipe
      </Button>,
    );
    const after = button.getBoundingClientRect();
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.hasAttribute("data-disabled")).toBe(true);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
    expect(document.activeElement).toBe(button);
    button.click();
    expect(onClick).not.toHaveBeenCalled();
    // Not faded like a disabled button: loading is still the primary action.
    expect(getComputedStyle(button).opacity).toBe("1");
  });

  it("keeps the accessible name and centers the spinner", async () => {
    const { button } = await render(<Button loading>Save recipe</Button>);
    const spinner = button.querySelector<SVGElement>("[data-ouro-spinner]")!;
    expect(spinner).not.toBeNull();
    expect(spinner.closest("[aria-hidden='true']")).not.toBeNull();
    const label = button.querySelector<HTMLElement>("[data-ouro-label]")!;
    expect(label.textContent).toBe("Save recipe");
    expect(getComputedStyle(label).visibility).toBe("visible");
    const b = button.getBoundingClientRect();
    const s = spinner.getBoundingClientRect();
    expect(Math.abs(s.left + s.width / 2 - (b.left + b.width / 2))).toBeLessThanOrEqual(1);
    expect(Math.abs(s.top + s.height / 2 - (b.top + b.height / 2))).toBeLessThanOrEqual(1);
  });

  it("does not submit its form while loading", async () => {
    const onSubmit = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    const { host } = await render(
      <form onSubmit={onSubmit}>
        <Button type="submit" loading>
          Save
        </Button>
      </form>,
    );
    host.querySelector("button")!.click();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("renders a busy link that cannot be followed", async () => {
    const onClick = vi.fn();
    const { button } = await render(
      <Button href="/recipes" loading onClick={onClick}>
        Recipes
      </Button>,
    );
    expect(button.tagName).toBe("A");
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.getAttribute("aria-disabled")).toBe("true");
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("link branch", () => {
  it("renders an internal href as an <a> by default", async () => {
    const { button } = await render(<Button href="/x">Go</Button>);
    expect(button.tagName).toBe("A");
    expect(button.getAttribute("href")).toBe("/x");
    expect(button.getAttribute("data-ouro")).toBe("button");
    expect(button.hasAttribute("type")).toBe(false);
  });

  it("renders internal hrefs through the provider's linkComponent", async () => {
    const RouterLink: OuroLinkComponent = (props) => <a data-router="" {...props} />;
    const onClick = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    const { button } = await render(
      <OuroProvider linkComponent={RouterLink}>
        <Button href="/recipes" onClick={onClick}>
          Recipes
        </Button>
      </OuroProvider>,
    );
    expect(button.hasAttribute("data-router")).toBe(true);
    expect(button.getAttribute("href")).toBe("/recipes");
    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it.each(["https://ouro.bot", "http://ouro.bot", "mailto:hi@ouro.bot", "//cdn.ouro.bot/x"])(
    "renders %s as a plain <a>, bypassing linkComponent",
    async (href) => {
      const RouterLink: OuroLinkComponent = (props) => <a data-router="" {...props} />;
      const { button } = await render(
        <OuroProvider linkComponent={RouterLink}>
          <Button href={href}>Out</Button>
        </OuroProvider>,
      );
      expect(button.hasAttribute("data-router")).toBe(false);
      expect(button.getAttribute("href")).toBe(href);
      expect(button.hasAttribute("rel")).toBe(false);
    },
  );

  it('adds rel="noopener noreferrer" to an external link with target="_blank"', async () => {
    const { button } = await render(
      <Button href="https://ouro.bot" target="_blank">
        Ouro
      </Button>,
    );
    expect(button.getAttribute("target")).toBe("_blank");
    expect(button.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("keeps an explicit rel", async () => {
    const { button } = await render(
      <Button href="https://ouro.bot" target="_blank" rel="noopener">
        Ouro
      </Button>,
    );
    expect(button.getAttribute("rel")).toBe("noopener");
  });

  it("forwards a ref to the anchor", async () => {
    let element: HTMLAnchorElement | null = null;
    await render(
      <Button
        href="/x"
        ref={(node) => {
          element = node;
        }}
      >
        Go
      </Button>,
    );
    expect(element).toBeInstanceOf(HTMLAnchorElement);
  });

  it("looks like a button, not a link", async () => {
    const { button } = await render(<Button href="/x">Go</Button>);
    expect(getComputedStyle(button).textDecorationLine).toBe("none");
    expect(getComputedStyle(button).display).toBe("inline-flex");
  });
});

describe("appearance", () => {
  const variants = ["solid", "soft", "outline", "plain"] as const;
  const tones = ["neutral", "accent", "success", "warning", "danger"] as const;

  it("defaults to a solid accent button", async () => {
    const { host } = await render(
      <>
        <Button>Default</Button>
        <Button tone="accent" variant="solid">
          Explicit
        </Button>
      </>,
    );
    const [a, b] = [...host.querySelectorAll("button")].map((el) => getComputedStyle(el));
    expect(a!.backgroundColor).toBe(b!.backgroundColor);
    expect(a!.color).toBe(b!.color);
    expect(a!.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("gives every tone and variant a distinct, non-default look", async () => {
    const seen = new Set<string>();
    for (const variant of variants) {
      for (const tone of tones) {
        const { button } = await render(
          <Button tone={tone} variant={variant}>
            {tone}
          </Button>,
        );
        const style = getComputedStyle(button);
        seen.add(`${style.backgroundColor}|${style.color}|${style.borderTopColor}`);
      }
    }
    expect(seen.size).toBe(variants.length * tones.length);
  });

  it("uses tone-ink text on soft backgrounds", async () => {
    const { host } = await render(
      <>
        <Button variant="soft">Soft</Button>
        <i className="ou:text-accent-ink" />
      </>,
    );
    expect(getComputedStyle(host.querySelector("button")!).color).toBe(
      getComputedStyle(host.querySelector("i")!).color,
    );
  });

  it("does not inherit the browser's button chrome", async () => {
    const { button } = await render(<Button variant="plain">Plain</Button>);
    const style = getComputedStyle(button);
    expect(style.boxSizing).toBe("border-box");
    expect(style.borderTopStyle).toBe("solid");
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.borderTopColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("orders sizes sm < md < lg", async () => {
    const { host } = await render(
      <>
        <Button size="sm">Small</Button>
        <Button>Medium</Button>
        <Button size="lg">Large</Button>
      </>,
    );
    const [sm, md, lg] = [...host.querySelectorAll("button")].map((el) => el.getBoundingClientRect().height);
    expect(sm).toBeLessThan(md!);
    expect(md).toBeLessThan(lg!);
  });

  it("shows a crisp focus ring in the tone color on keyboard focus", async () => {
    const { host } = await render(
      <>
        <Button tone="danger">Delete</Button>
        <i className="ou:bg-danger" />
      </>,
    );
    const button = host.querySelector("button")!;
    document.body.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    expect(button.matches(":focus-visible")).toBe(true);
    const style = getComputedStyle(button);
    expect(style.outlineStyle).toBe("solid");
    expect(style.outlineWidth).toBe("2px");
    expect(style.outlineOffset).toBe("2px");
    expect(style.outlineColor).toBe(getComputedStyle(host.querySelector("i")!).backgroundColor);
  });
});

describe("density", () => {
  afterEach(async () => {
    await page.viewport(414, 896);
  });

  it("is shorter at 1280px than at 390px", async () => {
    await page.viewport(390, 844);
    const { button } = await render(<Button>Density</Button>);
    const phone = button.getBoundingClientRect().height;
    await page.viewport(1280, 800);
    await expect.poll(() => button.getBoundingClientRect().height).toBeLessThan(phone);
    expect(phone).toBe(44);
  });
});

describe("press feedback", () => {
  async function pressScale(button: HTMLElement) {
    await commands.pointerPress({ selector: `[data-press-probe]`, action: "down" });
    try {
      // Wait for the press-in transition to settle.
      await new Promise((resolve) => setTimeout(resolve, 250));
      return getComputedStyle(button).scale;
    } finally {
      await commands.pointerPress({ selector: `[data-press-probe]`, action: "up" });
    }
  }

  it("scales to --ouro-press-scale while pressed", async () => {
    const { button } = await render(<Button data-press-probe="">Press</Button>);
    expect(getComputedStyle(button).scale).toBe("none");
    expect(await pressScale(button)).toBe("0.97");
  });

  it("does not scale with reduced motion", async () => {
    await commands.emulateMedia({ reducedMotion: "reduce" });
    const { button } = await render(<Button data-press-probe="">Press</Button>);
    expect(await pressScale(button)).toBe("none");
  });

  it("does not scale while loading", async () => {
    const { button } = await render(
      <Button data-press-probe="" loading>
        Press
      </Button>,
    );
    expect(await pressScale(button)).toBe("none");
  });

  it("springs back with the theme's spring tokens", async () => {
    const { button } = await render(<Button>Spring</Button>);
    const style = getComputedStyle(button);
    const properties = style.transitionProperty.split(", ");
    const durations = style.transitionDuration.split(", ");
    const easings = style.transitionTimingFunction.split(/,\s(?![^(]*\))/);
    const scaleIndex = properties.indexOf("scale");
    expect(scaleIndex).toBeGreaterThanOrEqual(0);
    expect(durations[scaleIndex]).toBe("0.75s");
    expect(easings[scaleIndex]).toMatch(/^linear\(/);
  });
});

describe("className", () => {
  it("lets app layout classes win over library styles", async () => {
    addStyle(".mt-4 { margin-top: 16px; } .w-full { width: 100%; }");
    const { host, button } = await render(
      <div style={{ width: 320 }}>
        <Button className="mt-4 w-full">Go</Button>
      </div>,
    );
    expect(button.classList.contains("mt-4")).toBe(true);
    expect(getComputedStyle(button).marginTop).toBe("16px");
    expect(button.getBoundingClientRect().width).toBe(host.firstElementChild!.getBoundingClientRect().width);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns exactly once for an appearance class, pointing to tone", async () => {
    const screen = await render(<Button className="bg-red-500">Go</Button>);
    await screen.rerender(<Button className="bg-red-500">Go again</Button>);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toBe(
      '[ouro-ui] Button: "bg-red-500" sets appearance, and className is for layout only. Fix: tone="danger".',
    );
  });

  it.each([
    ["text-lg", 'size="lg"'],
    ["rounded-full", 'defineTheme({ radius: { control: "999px" } })'],
    ["md:border-2", 'variant="outline"'],
    ["bg-transparent", 'variant="plain"'],
    ["hover:bg-emerald-600", 'tone="success"'],
    ["font-bold", 'size="lg"'],
    ["text-center", '<div className="text-center"><Button /></div>'],
  ])("points %s to %s", async (className, fix) => {
    await render(<Button className={className}>Go</Button>);
    expect(String(warn.mock.calls[0]?.[0])).toContain(`Fix: ${fix}.`);
  });

  it("checks the className on links too", async () => {
    await render(
      <Button href="/x" className="shadow-lg">
        Go
      </Button>,
    );
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("scoped theme overrides", () => {
  it("follows a scoped --ouro-color-accent on a real Button", async () => {
    const { host } = await render(
      <>
        <Button>Plain</Button>
        <Button variant="soft">Plain soft</Button>
        <div style={{ "--ouro-color-accent": "rgb(255, 0, 0)" } as React.CSSProperties}>
          <Button>Scoped</Button>
          <Button variant="soft">Scoped soft</Button>
        </div>
      </>,
    );
    const [plain, plainSoft, scoped, scopedSoft] = [...host.querySelectorAll("button")].map(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(scoped).toBe("rgb(255, 0, 0)");
    expect(scoped).not.toBe(plain);
    expect(scopedSoft).not.toBe(plainSoft);
    expect(scopedSoft).toMatch(/^(color\(srgb 1 0 0 \/ 0\.14\)|rgba\(255, 0, 0, 0\.14\)|oklab\(.*\/ 0\.14\))/);
  });

  it("follows a [data-theme] scheme on the root", async () => {
    const colorIn = async (theme: string) => {
      document.documentElement.dataset["theme"] = theme;
      const { button } = await render(<Button>Theme</Button>);
      return getComputedStyle(button).backgroundColor;
    };
    try {
      expect(await colorIn("light")).toBe("rgb(37, 99, 235)");
      expect(await colorIn("dark")).toBe("rgb(96, 165, 250)");
    } finally {
      delete document.documentElement.dataset["theme"];
    }
  });
});

describe("touch target", () => {
  it("does not grow the hit area for a fine pointer", async () => {
    const { button } = await render(<Button size="sm">Tap</Button>);
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top - 2);
    expect(hit?.closest("button")).not.toBe(button);
  });
});

describe("server rendering", () => {
  it("renders to a string without warnings", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const html = renderToString(
      <>
        <Button className="bg-red-500">Go</Button>
        <Button href="/x">Link</Button>
        <Button loading>Busy</Button>
      </>,
    );
    expect(html).toContain('data-ouro="button"');
    expect(html).toContain('href="/x"');
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
