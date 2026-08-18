/**
 * Contract test for the ghostty-web API surface consumed by
 * components/terminal/GhosttyTerminal.tsx.
 *
 * The component loads ghostty-web via a dynamic import and types the instance
 * as `any`, so a breaking upstream rename would compile and ship silently.
 * This test pins the exact symbols and methods that component calls, so a
 * dependency bump that drops one fails here instead of at runtime on /shell.
 *
 * WASM is never instantiated: init() is not called, only the exported shapes
 * are inspected.
 */
import { describe, it, expect } from "vitest";

describe("ghostty-web API surface used by GhosttyTerminal", () => {
  it("exports init, Terminal and FitAddon", async () => {
    const mod = await import("ghostty-web");

    expect(typeof mod.init).toBe("function");
    expect(typeof mod.Terminal).toBe("function");
    expect(typeof mod.FitAddon).toBe("function");
  });

  it("Terminal exposes the methods the component calls", async () => {
    const { Terminal } = await import("ghostty-web");

    // GhosttyTerminal.tsx calls each of these on the Terminal instance.
    for (const method of [
      "open",
      "write",
      "writeln",
      "loadAddon",
      "focus",
      "dispose",
    ]) {
      expect(
        typeof (Terminal.prototype as unknown as Record<string, unknown>)[
          method
        ],
      ).toBe("function");
    }
  });

  it("a Terminal instance exposes cols, rows and a disposable onData", async () => {
    const { Terminal } = await import("ghostty-web");

    // cols, rows and onData are instance members assigned in the constructor,
    // so they are invisible on the prototype. ITerminalOptions.ghostty is the
    // library's documented test-isolation hook: passing an instance skips the
    // module-level init() WASM load, so a stub is enough to inspect the shape
    // the component relies on.
    const term = new Terminal({
      ghostty: {} as unknown as NonNullable<
        ConstructorParameters<typeof Terminal>[0]
      >["ghostty"],
    });

    // GhosttyTerminal.tsx sends these to the terminal server on resize.
    expect(typeof term.cols).toBe("number");
    expect(typeof term.rows).toBe("number");

    // The component keeps the returned disposable and calls dispose() on
    // unmount, so onData must stay an IEvent rather than a plain callback
    // setter.
    expect(typeof term.onData).toBe("function");
    const disposer = term.onData(() => {});
    expect(typeof disposer.dispose).toBe("function");
    disposer.dispose();

    term.dispose();
  });

  it("FitAddon exposes fit() and dispose()", async () => {
    const { FitAddon } = await import("ghostty-web");

    for (const method of ["fit", "dispose"]) {
      expect(
        typeof (FitAddon.prototype as unknown as Record<string, unknown>)[
          method
        ],
      ).toBe("function");
    }
  });
});
