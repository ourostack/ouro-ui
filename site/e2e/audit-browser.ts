// What Ouro UI's testing kit (registry/ouro/lib/ouro/testing/axe.ts) takes from vitest/browser,
// answered by the Playwright test that drives the page (audit.ts), so the kit's audit runs on a
// built page as it does in Vitest.

interface Driver {
  platform: string;
  browser: string;
  shot: (timeout: number) => Promise<string>;
  keys: (keys: string) => Promise<void>;
}

const driver = () => (window as unknown as { __ouroDriver: Driver }).__ouroDriver;

export const page = {
  // A picture of the element, as base64 PNG: the test finds it by the attribute set here.
  async screenshot({ element, timeout = 5000 }: { element: Element; timeout?: number }): Promise<string> {
    element.setAttribute("data-ouro-shot", "");
    try {
      return await driver().shot(timeout);
    } finally {
      element.removeAttribute("data-ouro-shot");
    }
  },
};

export const userEvent = {
  keyboard: (keys: string) => driver().keys(keys),
};

export const server = {
  get platform() {
    return driver().platform;
  },
  get browser() {
    return driver().browser;
  },
};
