import { describe, it, expect } from "vitest";
import {
  maskSecrets,
  createStreamMasker,
  DEFAULT_REDACTION_LABEL as R,
} from "@/lib/redaction/mask";

describe("maskSecrets — known secret shapes (no false negatives)", () => {
  it("masks OpenAI sk- keys (incl. sk-proj-)", () => {
    expect(maskSecrets("key sk-abcdefghijklmnop1234")).toBe(`key ${R}`);
    expect(
      maskSecrets("export OPENAI_API_KEY=sk-proj-AbCdEfGhIjKlMnOpQrStUv"),
    ).toBe(`export OPENAI_API_KEY=${R}`);
  });

  it("masks AWS access key ids (AKIA / ASIA)", () => {
    expect(maskSecrets("id AKIAIOSFODNN7EXAMPLE done")).toBe(`id ${R} done`);
    expect(maskSecrets("ASIAIOSFODNN7EXAMPLE")).toBe(R);
  });

  it("masks JWTs (three base64url segments with eyJ header)", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(maskSecrets(`token=${jwt}`)).toBe(`token=${R}`);
  });

  it("masks Bearer tokens but keeps the Bearer label", () => {
    expect(maskSecrets("Authorization: Bearer abcdef1234567890XYZ")).toBe(
      `Authorization: Bearer ${R}`,
    );
  });

  it("masks GitHub tokens (ghp_ and github_pat_)", () => {
    expect(maskSecrets("ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")).toBe(R);
    expect(
      maskSecrets("t github_pat_11ABCDEFG0abcdefghij_KLMNOPqrstuvWXYZ end"),
    ).toBe(`t ${R} end`);
  });

  it("masks Slack tokens (xoxb-/xoxp-)", () => {
    expect(maskSecrets("xoxb-123456789012-abcdefABCDEFghij")).toBe(R);
    expect(maskSecrets("xoxp-000000000000-abcdefABCDEFghij")).toBe(R);
  });

  it("masks long hex secrets (>= 32 hex chars)", () => {
    const hex = "0123456789abcdef0123456789abcdef"; // 32
    expect(maskSecrets(`secret ${hex}`)).toBe(`secret ${R}`);
  });
});

describe("maskSecrets — true negatives (bound false positives)", () => {
  it("leaves ordinary prose untouched", () => {
    const text = "The quick brown fox jumps over the lazy dog.";
    expect(maskSecrets(text)).toBe(text);
  });

  it("does not mask dotted identifiers / versions / filenames", () => {
    expect(maskSecrets("version 1.2.3 released")).toBe("version 1.2.3 released");
    expect(maskSecrets("open a.b.c now")).toBe("open a.b.c now");
  });

  it("does not mask short hex below the threshold", () => {
    expect(maskSecrets("color deadbeef here")).toBe("color deadbeef here");
    // 31 hex chars — one below the 32 threshold
    expect(maskSecrets("h 0123456789abcdef0123456789abcde")).toBe(
      "h 0123456789abcdef0123456789abcde",
    );
  });

  it("does not mask a shell prompt or common tokens", () => {
    expect(maskSecrets("user@host:~/project$ ls -la")).toBe(
      "user@host:~/project$ ls -la",
    );
  });
});

describe("maskSecrets — ANSI safety", () => {
  it("passes escape sequences through untouched", () => {
    const ansi = "\x1b[2J\x1b[H\x1b[31mhello\x1b[0m";
    expect(maskSecrets(ansi)).toBe(ansi);
  });

  it("masks a secret wrapped in color codes without mangling the codes", () => {
    const input = "\x1b[31msk-abcdefghijklmnop1234\x1b[0m";
    expect(maskSecrets(input)).toBe(`\x1b[31m${R}\x1b[0m`);
  });

  it("does not scan inside OSC payloads (e.g. clipboard/hyperlinks)", () => {
    // OSC 52 clipboard payload contains base64 that must not be altered.
    const osc = "\x1b]52;c;c2stYWJjZGVmZ2hpamtsbW5vcA==\x07plain text";
    expect(maskSecrets(osc)).toBe(osc);
  });
});

describe("maskSecrets — known credential values", () => {
  it("masks exact known values wherever they appear", () => {
    expect(
      maskSecrets("password is hunter2value", {
        knownValues: ["hunter2value"],
      }),
    ).toBe(`password is ${R}`);
  });

  it("ignores known values shorter than 4 chars", () => {
    expect(maskSecrets("ab cd ef", { knownValues: ["ab"] })).toBe("ab cd ef");
  });

  it("honours a custom label", () => {
    expect(
      maskSecrets("sk-abcdefghijklmnop1234", { label: "***" }),
    ).toBe("***");
  });
});

describe("maskSecrets — mid-token ANSI escapes (grep/ls --color)", () => {
  it("masks an AWS key split by SGR + erase-line (real grep --color output)", () => {
    // grep --color=always AKIA ... emits the match wrapped in color codes.
    const input = "\x1b[01;31m\x1b[KAKIA\x1b[m\x1b[KIOSFODNN7EXAMPLE";
    expect(maskSecrets(input)).toBe(`\x1b[01;31m\x1b[K${R}\x1b[m\x1b[K`);
    // The full key must NOT survive anywhere in the output.
    expect(maskSecrets(input)).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(maskSecrets(input)).not.toContain("IOSFODNN7EXAMPLE");
  });

  it("masks an sk- key split by a mid-token reset (\\x1b[0m)", () => {
    const input = "sk-abc\x1b[0mdefghijklmnop1234";
    expect(maskSecrets(input)).toBe(`${R}\x1b[0m`);
  });

  it("masks a hex secret split by \\x1b[K in the middle", () => {
    const input = "0123456789abcdef\x1b[K0123456789abcdef";
    expect(maskSecrets(input)).toBe(`${R}\x1b[K`);
  });

  it("does not join tokens across a real newline (control boundary)", () => {
    // AKIA and the rest are on different logical lines — must NOT be merged.
    const input = "AKIA\nIOSFODNN7EXAMPLE";
    expect(maskSecrets(input)).toBe("AKIA\nIOSFODNN7EXAMPLE");
  });
});

describe("maskSecrets — deliberate over-masking of long hex", () => {
  it("does NOT mask UUIDs or short/git-short hashes (false-positive bound)", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    expect(maskSecrets(`id ${uuid}`)).toBe(`id ${uuid}`);
    expect(maskSecrets("commit a1b2c3d")).toBe("commit a1b2c3d");
  });

  it("DOES mask checksums / docker digests (pinned as intentional)", () => {
    const md5 = "d41d8cd98f00b204e9800998ecf8427e"; // 32
    const sha256 =
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"; // 64
    expect(maskSecrets(`sum ${md5}`)).toBe(`sum ${R}`);
    expect(maskSecrets(`sha256:${sha256}`)).toBe(`sha256:${R}`);
  });
});

describe("createStreamMasker — chunk-boundary safety", () => {
  it("masks a token split across two chunks", () => {
    const m = createStreamMasker();
    const full = "secret sk-abcdefghijklmnop999 done";
    const out =
      m.push("secret sk-abc") + m.push("defghijklmnop999 done") + m.flush();
    expect(out).toBe(maskSecrets(full));
    expect(out).toBe(`secret ${R} done`);
  });

  it("reassembles an ANSI escape split across two chunks", () => {
    const m = createStreamMasker();
    const out = m.push("\x1b[3") + m.push("1msecret\x1b[0m") + m.flush();
    expect(out).toBe("\x1b[31msecret\x1b[0m");
  });

  it("emits a shell prompt immediately (does not carry trailing non-token)", () => {
    const m = createStreamMasker();
    expect(m.push("user@host:~$ ")).toBe("user@host:~$ ");
  });

  it("flush() emits any carried tail (masked)", () => {
    const m = createStreamMasker();
    // Whole chunk is one token run — carried until flush.
    expect(m.push("sk-abcdefghijklmnop1234")).toBe("");
    expect(m.flush()).toBe(R);
  });

  it("reset() discards carried state", () => {
    const m = createStreamMasker();
    m.push("sk-abcdefghijklmnop1234");
    m.reset();
    expect(m.flush()).toBe("");
  });

  it("masks a token split mid-token by an escape AND across a chunk boundary", () => {
    // grep-color output where the chunk boundary lands inside the colored key.
    const full = "\x1b[01;31m\x1b[KAKIA\x1b[m\x1b[KIOSFODNN7EXAMPLE";
    const expected = maskSecrets(full);
    for (let cut = 1; cut < full.length; cut++) {
      const m = createStreamMasker();
      const out =
        m.push(full.slice(0, cut)) + m.push(full.slice(cut)) + m.flush();
      expect(out).toBe(expected);
    }
  });

  it("does not corrupt an incomplete OSC payload larger than the text cap", () => {
    // 5000-byte OSC-52 clipboard payload split so the first chunk holds an
    // unterminated escape > MAX_CARRY (4096). It must be carried intact, never
    // re-tokenized as text, never masked.
    const payload = "A".repeat(5000);
    const chunk1 = `\x1b]52;c;${payload}`; // unterminated OSC
    const chunk2 = "BBBBBBBBBB\x07done";
    const m = createStreamMasker();
    const out = m.push(chunk1) + m.push(chunk2) + m.flush();
    expect(out).toBe(chunk1 + chunk2);
    expect(out).not.toContain(R);
  });

  it("emits a runaway unterminated escape raw once it exceeds the esc cap", () => {
    const huge = `\x1b]52;c;${"A".repeat(300000)}`; // > MAX_ESC_CARRY, no ST
    const m = createStreamMasker();
    const out = m.push(huge) + m.flush();
    expect(out).toBe(huge);
    expect(out).not.toContain(R);
  });

  it("streaming equals whole-string masking across many 2- and 3-way splits", () => {
    const full =
      "log: Bearer abcdef1234567890 then AKIAIOSFODNN7EXAMPLE and " +
      "0123456789abcdef0123456789abcdef trailing\n";
    const expected = maskSecrets(full);
    for (let i = 1; i < full.length; i++) {
      // 2-way
      const m2 = createStreamMasker();
      expect(m2.push(full.slice(0, i)) + m2.push(full.slice(i)) + m2.flush()).toBe(
        expected,
      );
      // 3-way (step j to keep the loop bounded)
      for (let j = i + 1; j < full.length; j += 7) {
        const m3 = createStreamMasker();
        const out =
          m3.push(full.slice(0, i)) +
          m3.push(full.slice(i, j)) +
          m3.push(full.slice(j)) +
          m3.flush();
        expect(out).toBe(expected);
      }
    }
  });

  it("OFF->ON toggle mid-stream: no crash, later secrets masked, no loss on OFF", () => {
    // Mirrors the component write path: ON -> masker.push(); OFF -> flush()+raw.
    const m = createStreamMasker();
    const write = (enabled: boolean, data: string) =>
      enabled ? m.push(data) : m.flush() + data;

    // OFF: raw passthrough.
    expect(write(false, "prompt$ ")).toBe("prompt$ ");
    // ON: a complete secret (line-terminated) is fully masked.
    expect(write(true, "key sk-abcdefghijklmnop1234\n")).toBe(`key ${R}\n`);
    // ON: partial token is carried (not yet emitted).
    expect(write(true, "secret sk-abc")).toBe("secret ");
    // Toggle OFF: carried bytes are flushed (no loss), then raw is written.
    expect(write(false, "next")).toBe("sk-abcnext");
  });
});
