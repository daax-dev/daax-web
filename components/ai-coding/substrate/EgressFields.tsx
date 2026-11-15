"use client";

import { useEffect, useRef, useState } from "react";
import { Globe, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { substrateApi, type EgressUpdate } from "@/lib/substrate/client";

export type EgressPresetId = NonNullable<EgressUpdate["egressPresets"]>[number];

export const PRESET_LABELS: Record<EgressPresetId, string> = {
  npm: "npm",
  pypi: "PyPI",
  github: "GitHub",
};

export interface EgressValue {
  presets: EgressPresetId[];
  hosts: string[];
}

export interface EgressValidity {
  /** Validation is running for the current value. */
  checking: boolean;
  /** The current value passed the server's validation. */
  valid: boolean;
}

/**
 * Egress allowlist fields (dx#118 / #123): reviewed presets plus extra hosts.
 * Every change is validated by the server's own validator
 * (`POST /api/substrate/egress/validate`) and errors are shown inline, per
 * host. The LLM gateway rule is always present and is not editable here.
 */
export function EgressFields({
  value,
  onChange,
  presets,
  onValidity,
  idPrefix = "egress",
}: {
  value: EgressValue;
  onChange: (v: EgressValue) => void;
  /** Preset id -> hosts it allows (from config). */
  presets: Record<string, readonly string[]>;
  onValidity?: (v: EgressValidity) => void;
  idPrefix?: string;
}) {
  const [draft, setDraft] = useState("");
  const [hostErrors, setHostErrors] = useState<Array<string | null>>([]);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const onValidityRef = useRef(onValidity);
  onValidityRef.current = onValidity;

  const key = JSON.stringify(value);
  useEffect(() => {
    const mine = ++seq.current;
    onValidityRef.current?.({ checking: true, valid: false });
    const t = setTimeout(() => {
      substrateApi
        .validateEgress({
          egressPresets: value.presets,
          egressHosts: value.hosts,
        })
        .then((r) => {
          if (mine !== seq.current) return;
          setHostErrors(r.hostErrors);
          setError(r.error);
          onValidityRef.current?.({
            checking: false,
            valid: r.error === null && r.hostErrors.every((e) => e === null),
          });
        })
        .catch((err: Error) => {
          if (mine !== seq.current) return;
          setHostErrors([]);
          setError(err.message);
          onValidityRef.current?.({ checking: false, valid: false });
        });
    }, 300);
    return () => clearTimeout(t);
    // `key` is the serialized value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const addDraft = () => {
    const parts = draft
      .split(/[\s,]+/)
      .map((h) => h.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    const next = [...value.hosts];
    for (const p of parts) if (!next.includes(p)) next.push(p);
    onChange({ ...value, hosts: next });
    setDraft("");
  };

  const togglePreset = (id: EgressPresetId, on: boolean) =>
    onChange({
      ...value,
      presets: on
        ? [...new Set([...value.presets, id])].sort()
        : value.presets.filter((p) => p !== id),
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4">
        {(Object.keys(presets) as EgressPresetId[]).map((id) => (
          <label
            key={id}
            htmlFor={`${idPrefix}-preset-${id}`}
            className="flex items-center gap-2 text-sm cursor-pointer"
            title={presets[id].join(", ")}
          >
            <Checkbox
              id={`${idPrefix}-preset-${id}`}
              checked={value.presets.includes(id)}
              onCheckedChange={(c) => togglePreset(id, c === true)}
            />
            {PRESET_LABELS[id] ?? id}
            <span className="text-xs text-muted-foreground">
              ({presets[id].length} host{presets[id].length === 1 ? "" : "s"})
            </span>
          </label>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor={`${idPrefix}-host`}
          className="text-xs text-muted-foreground"
        >
          Extra hosts (TLS passthrough on 443)
        </Label>
        <div className="flex gap-2">
          <Input
            id={`${idPrefix}-host`}
            placeholder="api.example.com or *.example.com"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addDraft();
              }
            }}
            className="h-8"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addDraft}
            disabled={!draft.trim()}
            aria-label="Add host"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {value.hosts.length > 0 && (
          <ul className="space-y-1" aria-label="Extra egress hosts">
            {value.hosts.map((h, i) => (
              <li key={h} className="flex flex-col">
                <div
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1 text-xs font-mono",
                    hostErrors[i] && "border-destructive/60 bg-destructive/5",
                  )}
                >
                  <Globe className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate flex-1">{h}</span>
                  <button
                    type="button"
                    className="rounded p-0.5 hover:bg-muted"
                    aria-label={`Remove ${h}`}
                    onClick={() =>
                      onChange({
                        ...value,
                        hosts: value.hosts.filter((x) => x !== h),
                      })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
                {hostErrors[i] && (
                  <span
                    role="alert"
                    className="text-xs text-destructive mt-0.5"
                  >
                    {hostErrors[i]}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Default-deny. The LLM gateway is always reachable; everything else needs
        a preset or an extra host.
      </p>
    </div>
  );
}
