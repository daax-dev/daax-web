import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "events";
import { generateRealSbom, SYFT_IMAGE } from "@/lib/sbom-syft";

// A realistic CycloneDX SBOM string that clears the guard's size + marker checks.
function realSbomJson(): string {
  return JSON.stringify({
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    components: Array.from({ length: 25 }, (_, i) => ({
      type: "library",
      name: `pkg-${i}`,
      version: "1.2.3",
      purl: `pkg:npm/pkg-${i}@1.2.3`,
    })),
  });
}

// Build a fake child_process.spawn that emits the given stdout/stderr then a
// close code (or an error), asynchronously, like the real thing.
function fakeSpawn(opts: {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  error?: Error;
}) {
  return vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    queueMicrotask(() => {
      if (opts.error) {
        child.emit("error", opts.error);
        return;
      }
      if (opts.stdout) child.stdout.emit("data", Buffer.from(opts.stdout));
      if (opts.stderr) child.stderr.emit("data", Buffer.from(opts.stderr));
      child.emit("close", opts.code ?? 0);
    });
    return child;
  }) as unknown as typeof import("child_process").spawn;
}

describe("generateRealSbom (F2, #97)", () => {
  it("uses a digest-pinned scanner image by default", () => {
    expect(SYFT_IMAGE).toMatch(/^anchore\/syft:v[0-9.]+@sha256:[a-f0-9]{64}$/);
  });

  it("returns the SBOM JSON when syft succeeds and the guard passes", async () => {
    const sbom = realSbomJson();
    const result = await generateRealSbom(
      "daax:test",
      fakeSpawn({ stdout: sbom, code: 0 }),
    );
    expect(result).toBe(sbom);
  });

  it("returns null when syft exits non-zero", async () => {
    const result = await generateRealSbom(
      "daax:test",
      fakeSpawn({ stderr: "syft boom", code: 1 }),
    );
    expect(result).toBeNull();
  });

  it("returns null when syft output fails the placeholder guard (empty object)", async () => {
    const result = await generateRealSbom(
      "daax:test",
      fakeSpawn({ stdout: "{}", code: 0 }),
    );
    expect(result).toBeNull();
  });

  it("returns null when the syft process errors", async () => {
    const result = await generateRealSbom(
      "daax:test",
      fakeSpawn({ error: new Error("docker not found") }),
    );
    expect(result).toBeNull();
  });

  it("kills a scan whose output exceeds the configured limit", async () => {
    const spawn = fakeSpawn({ stdout: realSbomJson(), code: 0 });
    const result = await generateRealSbom("daax:test", spawn, {
      maxOutputBytes: 10,
    });
    expect(result).toBeNull();
    const child = (spawn as unknown as ReturnType<typeof vi.fn>).mock.results[0]
      .value as {
      kill: ReturnType<typeof vi.fn>;
    };
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("kills and releases a scan that exceeds its timeout", async () => {
    vi.useFakeTimers();
    try {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: ReturnType<typeof vi.fn>;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn();
      const spawn = vi.fn(
        () => child,
      ) as unknown as typeof import("child_process").spawn;
      const result = generateRealSbom("daax:hung", spawn, { timeoutMs: 25 });
      await vi.advanceTimersByTimeAsync(25);
      await expect(result).resolves.toBeNull();
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    } finally {
      vi.useRealTimers();
    }
  });
});
