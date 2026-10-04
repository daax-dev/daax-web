import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Markdown } from "@/components/workers/Markdown";

describe("Markdown", () => {
  it("renders headings, lists, tables, bold, code and links", () => {
    const md = [
      "## Goals",
      "| Goal | Status |",
      "| --- | --- |",
      "| RBAC | **at-risk** |",
      "",
      "- one `x`",
      "- two",
      "",
      "1. first",
      "",
      "See [PR 12](https://github.com/o/r/pull/12).",
    ].join("\n");
    const { container } = render(<Markdown text={md} />);
    expect(container.querySelector("h3")?.textContent).toBe("Goals");
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelector("strong")?.textContent).toBe("at-risk");
    expect(container.querySelectorAll("ul li")).toHaveLength(2);
    expect(container.querySelectorAll("ol li")).toHaveLength(1);
    expect(container.querySelector("code")?.textContent).toBe("x");
    const a = container.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://github.com/o/r/pull/12");
    expect(a?.getAttribute("rel")).toBe("noreferrer");
  });

  it("never renders raw HTML from report text", () => {
    const { container } = render(
      <Markdown
        text={'<img src=x onerror="alert(1)"> and <script>alert(2)</script>'}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });

  it("only links http(s) URLs", () => {
    const { container } = render(
      <Markdown text="[bad](javascript:alert(1)) [ok](https://example.com)" />,
    );
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("https://example.com");
  });
});
