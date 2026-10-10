import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ouroTheme } from "./ouro.ts";
import { ThemeScript } from "./ThemeScript.tsx";

function scriptSource(element: Parameters<typeof renderToString>[0]) {
  const html = renderToString(element);
  const match = /^<script[^>]*>([\s\S]*)<\/script>$/.exec(html);
  if (!match?.[1]) throw new Error(`unexpected markup: ${html}`);
  return match[1];
}

const run = (element: Parameters<typeof renderToString>[0]) => {
  new Function(scriptSource(element))();
  return document.documentElement.dataset["theme"];
};

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset["theme"];
});

describe("ThemeScript", () => {
  it("sets data-theme from a stored dark preference", () => {
    localStorage.setItem("ouro-theme", "dark");
    expect(run(<ThemeScript />)).toBe("dark");
  });

  it("sets data-theme from a stored light preference", () => {
    localStorage.setItem("ouro-theme", "light");
    expect(run(<ThemeScript defaultTheme="dark" />)).toBe("light");
  });

  it("removes the attribute for a stored system preference", () => {
    document.documentElement.dataset["theme"] = "dark";
    localStorage.setItem("ouro-theme", "system");
    expect(run(<ThemeScript />)).toBeUndefined();
  });

  it("falls back to defaultTheme when nothing is stored", () => {
    expect(run(<ThemeScript defaultTheme="dark" />)).toBe("dark");
  });

  it("follows the system by default", () => {
    document.documentElement.dataset["theme"] = "dark";
    expect(run(<ThemeScript />)).toBeUndefined();
  });

  it("ignores an unrecognized stored value and uses defaultTheme", () => {
    localStorage.setItem("ouro-theme", "blue");
    expect(run(<ThemeScript defaultTheme="dark" />)).toBe("dark");
  });

  it("passes a nonce to the script element", () => {
    expect(renderToString(<ThemeScript nonce="abc123" />)).toContain('nonce="abc123"');
    expect(renderToString(<ThemeScript />)).not.toContain("nonce");
  });

  it("reads a custom storage key", () => {
    localStorage.setItem("my-key", "dark");
    expect(run(<ThemeScript storageKey="my-key" />)).toBe("dark");
  });

  it("applies the default when storage throws", () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error("blocked");
    };
    try {
      expect(run(<ThemeScript defaultTheme="dark" />)).toBe("dark");
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it("cannot be closed early by a hostile storage key", () => {
    const html = renderToString(<ThemeScript storageKey={'</script><img src=x onerror="1">'} />);
    expect(html.match(/<\/script>/g)).toHaveLength(1);
  });

  it("applies the stored theme before the body is parsed (no flash on first paint)", async () => {
    localStorage.setItem("ouro-theme", "dark");
    const frame = document.createElement("iframe");
    const seen: { theme?: string | undefined; scheme?: string | undefined } = {};
    Object.assign(window, {
      __ouroSeen: () => {
        seen.theme = frame.contentDocument?.documentElement.dataset["theme"];
        seen.scheme = frame.contentWindow?.getComputedStyle(frame.contentDocument!.documentElement).colorScheme;
      },
    });
    // An about:srcdoc frame shares this page's origin, so it reads the same localStorage.
    frame.srcdoc =
      `<!doctype html><html><head><style>${ouroTheme.css}</style><script>${scriptSource(<ThemeScript />)}</script></head>` +
      `<body><script>parent.__ouroSeen()</script></body></html>`;
    const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
    document.body.append(frame);
    await loaded;
    frame.remove();
    expect(seen.theme).toBe("dark");
    expect(seen.scheme).toBe("dark");
  });
});
