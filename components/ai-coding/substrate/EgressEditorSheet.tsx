"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { substrateApi, type SessionView } from "@/lib/substrate/client";
import {
  EgressFields,
  type EgressPresetId,
  type EgressValidity,
  type EgressValue,
} from "./EgressFields";
import { canEditEgress, sessionLabel } from "./state";

/** Hosts in `all` that no selected preset contributes: the user's extras. */
export function extraHosts(
  all: readonly string[],
  presets: readonly string[],
  presetHosts: Record<string, readonly string[]>,
): string[] {
  const fromPresets = new Set(presets.flatMap((p) => presetHosts[p] ?? []));
  return all.filter((h) => !fromPresets.has(h));
}

/**
 * Per-session egress editor (dx#123): view, add and remove hosts and presets
 * of a running or suspended session (PUT /api/substrate/sessions/:id/egress).
 */
export function EgressEditorSheet({
  session,
  presetHosts,
  open,
  onOpenChange,
  onSaved,
}: {
  session: SessionView | null;
  presetHosts: Record<string, readonly string[]>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (s: SessionView) => void;
}) {
  const [value, setValue] = useState<EgressValue>({ presets: [], hosts: [] });
  const [validity, setValidity] = useState<EgressValidity>({
    checking: false,
    valid: true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !session) return;
    setError(null);
    setValue({
      presets: session.egressPresets as EgressPresetId[],
      hosts: extraHosts(
        session.egressHosts,
        session.egressPresets,
        presetHosts,
      ),
    });
    // Reset only when the sheet opens (or targets another session): the
    // page re-polls sessions, which must not wipe edits in progress.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.id]);

  const editable = session ? canEditEgress(session) : false;

  const save = async () => {
    if (!session) return;
    setSaving(true);
    setError(null);
    try {
      const s = await substrateApi.updateEgress(session.id, {
        egressPresets: value.presets,
        egressHosts: value.hosts,
      });
      toast.success("Egress allowlist updated.");
      onSaved(s);
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Egress allowlist</SheetTitle>
          <SheetDescription>
            {session ? sessionLabel(session) : ""} · default-deny. Changes apply
            to the running actor immediately.
          </SheetDescription>
        </SheetHeader>
        {session && (
          <div className="px-4 space-y-4">
            <div>
              <p className="text-xs font-medium mb-1">Currently allowed</p>
              {session.egressHosts.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Only the LLM gateway.
                </p>
              ) : (
                <ul
                  className="text-xs font-mono space-y-0.5"
                  data-testid="egress-current"
                >
                  {session.egressHosts.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              )}
            </div>
            {editable ? (
              <EgressFields
                idPrefix="edit-egress"
                value={value}
                onChange={setValue}
                presets={presetHosts}
                onValidity={setValidity}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Egress can be changed only while the session is running or
                suspended.
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
        <SheetFooter>
          <Button
            onClick={() => void save()}
            disabled={
              !editable || saving || validity.checking || !validity.valid
            }
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save allowlist
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
