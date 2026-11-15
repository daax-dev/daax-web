"use client";

// Minimal markdown renderer for worker reports: headings, paragraphs, lists,
// tables, bold, inline code, fenced code and links. Builds React elements
// (never HTML strings), so report text cannot inject markup.

import { Fragment, type ReactNode } from "react";

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${i++}`;
    if (tok.startsWith("`")) {
      out.push(
        <code
          key={k}
          className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (tok.startsWith("**")) {
      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    } else {
      const label = tok.slice(1, tok.indexOf("]"));
      out.push(
        <a
          key={k}
          href={m[2]}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          {label}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `b${i}`;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.startsWith("```")) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```"))
        body.push(lines[i++]);
      i++;
      blocks.push(
        <pre
          key={key}
          className="overflow-x-auto rounded bg-muted p-3 font-mono text-xs"
        >
          {body.join("\n")}
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const size = h[1].length <= 2 ? "text-base" : "text-sm";
      blocks.push(
        <h3 key={key} className={`${size} mt-4 font-semibold first:mt-0`}>
          {inline(h[2], key)}
        </h3>,
      );
      i++;
      continue;
    }
    if (
      line.trim().startsWith("|") &&
      lines[i + 1]?.trim().match(/^\|?\s*:?-{3,}/)
    ) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|"))
        rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th
                    key={j}
                    className="border-b px-2 py-1 text-left font-medium text-muted-foreground"
                  >
                    {inline(c, `${key}h${j}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="border-b last:border-0">
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-1 align-top">
                      {inline(c, `${key}r${ri}c${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, ""));
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List
          key={key}
          className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5 text-sm`}
        >
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}i${j}`)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#|```|\s*([-*+]|\d+\.)\s|\|)/.test(lines[i])
    ) {
      para.push(lines[i++]);
    }
    if (para.length === 0) para.push(lines[i++]);
    blocks.push(
      <p key={key} className="text-sm leading-relaxed">
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && " "}
            {inline(p, `${key}p${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="space-y-2">{blocks}</div>;
}
