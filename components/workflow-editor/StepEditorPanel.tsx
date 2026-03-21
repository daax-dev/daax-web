"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  X,
  Trash2,
  ChevronDown,
  ChevronRight,
  Users,
  FileCode,
  Shield,
} from "lucide-react";
import type {
  WorkflowStep,
  WorkflowTransition,
  AgentAssignment,
  ValidationMode,
} from "@/types/flowspec-workflow";

interface StepEditorPanelProps {
  step: WorkflowStep | null;
  transition: WorkflowTransition | null;
  availableAgents: AgentAssignment[];
  availableStates: string[];
  onStepChange: (step: WorkflowStep) => void;
  onTransitionChange: (transition: WorkflowTransition) => void;
  onClose: () => void;
  onDelete?: () => void;
  onEditPrompt?: (stepId: string) => void;
}

export function StepEditorPanel({
  step,
  transition,
  availableAgents,
  availableStates,
  onStepChange,
  onTransitionChange,
  onClose,
  onDelete,
  onEditPrompt,
}: StepEditorPanelProps) {
  const [agentsExpanded, setAgentsExpanded] = useState(true);
  const [validationExpanded, setValidationExpanded] = useState(true);
  const [statesExpanded, setStatesExpanded] = useState(true);

  // Don't render if nothing selected (parent handles conditional render)
  if (!step && !transition) {
    return null;
  }

  // Editing a workflow step
  if (step) {
    return (
      <div className="w-80 border-l bg-card flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">Edit Workflow Step</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Command */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Command</Label>
              <input
                className="w-full text-sm bg-background border rounded px-2 py-1.5 font-mono"
                value={step.command}
                onChange={(e) =>
                  onStepChange({ ...step, command: e.target.value })
                }
                placeholder="/flow:step-name"
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Description
              </Label>
              <textarea
                className="w-full text-sm bg-background border rounded px-2 py-1.5 resize-none"
                rows={2}
                value={step.description}
                onChange={(e) =>
                  onStepChange({ ...step, description: e.target.value })
                }
              />
            </div>

            {/* Optional toggle */}
            <div className="flex items-center justify-between">
              <Label className="text-sm">Optional step</Label>
              <Switch
                checked={step.optional}
                onCheckedChange={(checked) =>
                  onStepChange({ ...step, optional: checked })
                }
              />
            </div>

            <Separator />

            {/* Input States */}
            <div className="space-y-2">
              <button
                className="flex items-center gap-1 text-sm font-medium w-full"
                onClick={() => setStatesExpanded(!statesExpanded)}
              >
                {statesExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <Shield className="h-4 w-4 text-muted-foreground" />
                Input States
              </button>
              {statesExpanded && (
                <div className="pl-5 space-y-2">
                  {step.input_states.map((state) => (
                    <div
                      key={state}
                      className="flex items-center justify-between text-sm bg-muted px-2 py-1 rounded"
                    >
                      <span>{state}</span>
                      <button
                        className="text-destructive hover:text-destructive/80"
                        onClick={() =>
                          onStepChange({
                            ...step,
                            input_states: step.input_states.filter(
                              (s) => s !== state,
                            ),
                          })
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <Select
                    onValueChange={(value) => {
                      if (!step.input_states.includes(value)) {
                        onStepChange({
                          ...step,
                          input_states: [...step.input_states, value],
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Add input state..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStates
                        .filter((s) => !step.input_states.includes(s))
                        .map((state) => (
                          <SelectItem key={state} value={state}>
                            {state}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Output State */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Output State
              </Label>
              <Select
                value={step.output_state}
                onValueChange={(value) =>
                  onStepChange({ ...step, output_state: value })
                }
              >
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableStates.map((state) => (
                    <SelectItem key={state} value={state}>
                      {state}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Separator />

            {/* Agents */}
            <div className="space-y-2">
              <button
                className="flex items-center gap-1 text-sm font-medium w-full"
                onClick={() => setAgentsExpanded(!agentsExpanded)}
              >
                {agentsExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <Users className="h-4 w-4 text-muted-foreground" />
                Agents ({step.agents.length})
              </button>
              {agentsExpanded && (
                <div className="pl-5 space-y-2">
                  {step.agents.map((agent, index) => (
                    <div
                      key={agent.name}
                      className="flex items-center justify-between text-sm bg-muted px-2 py-1.5 rounded"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium">{agent.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {agent.identity}
                        </span>
                      </div>
                      <button
                        className="text-destructive hover:text-destructive/80"
                        onClick={() =>
                          onStepChange({
                            ...step,
                            agents: step.agents.filter((_, i) => i !== index),
                          })
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <Select
                    onValueChange={(value) => {
                      const agent = availableAgents.find(
                        (a) => a.name === value,
                      );
                      if (agent && !step.agents.find((a) => a.name === value)) {
                        onStepChange({
                          ...step,
                          agents: [...step.agents, agent],
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Add agent..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAgents
                        .filter(
                          (a) => !step.agents.find((sa) => sa.name === a.name),
                        )
                        .map((agent) => (
                          <SelectItem key={agent.name} value={agent.name}>
                            {agent.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <Separator />

            {/* Prompt Template */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <FileCode className="h-3 w-3" />
                Prompt Template
              </Label>
              <code className="block text-xs bg-muted px-2 py-1 rounded break-all">
                {step.prompt_template ||
                  `templates/commands/flow/${step.id}.md`}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => onEditPrompt?.(step.id)}
                disabled={!onEditPrompt}
              >
                Edit Prompt
              </Button>
            </div>

            {/* Flags */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Flags</Label>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Creates backlog tasks</span>
                  <Switch
                    checked={step.creates_backlog_tasks || false}
                    onCheckedChange={(checked) =>
                      onStepChange({ ...step, creates_backlog_tasks: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Requires backlog tasks</span>
                  <Switch
                    checked={step.requires_backlog_tasks || false}
                    onCheckedChange={(checked) =>
                      onStepChange({ ...step, requires_backlog_tasks: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Builds constitution</span>
                  <Switch
                    checked={step.builds_constitution || false}
                    onCheckedChange={(checked) =>
                      onStepChange({ ...step, builds_constitution: checked })
                    }
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Requires human approval</span>
                  <Switch
                    checked={step.requires_human_approval || false}
                    onCheckedChange={(checked) =>
                      onStepChange({
                        ...step,
                        requires_human_approval: checked,
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>

        {onDelete && (
          <div className="p-4 border-t">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Step
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Editing a transition
  if (transition) {
    return (
      <div className="w-80 border-l bg-card flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold text-sm">Edit Transition</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">
            {/* Transition name */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Name</Label>
              <input
                className="w-full text-sm bg-background border rounded px-2 py-1.5"
                value={transition.name}
                onChange={(e) =>
                  onTransitionChange({ ...transition, name: e.target.value })
                }
              />
            </div>

            {/* From/To */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">From</Label>
                <Select
                  value={transition.from}
                  onValueChange={(value) =>
                    onTransitionChange({ ...transition, from: value })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStates.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">To</Label>
                <Select
                  value={transition.to}
                  onValueChange={(value) =>
                    onTransitionChange({ ...transition, to: value })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableStates.map((state) => (
                      <SelectItem key={state} value={state}>
                        {state}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Description
              </Label>
              <textarea
                className="w-full text-sm bg-background border rounded px-2 py-1.5 resize-none"
                rows={2}
                value={transition.description}
                onChange={(e) =>
                  onTransitionChange({
                    ...transition,
                    description: e.target.value,
                  })
                }
              />
            </div>

            <Separator />

            {/* Validation Mode */}
            <div className="space-y-2">
              <button
                className="flex items-center gap-1 text-sm font-medium w-full"
                onClick={() => setValidationExpanded(!validationExpanded)}
              >
                {validationExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                <Shield className="h-4 w-4 text-muted-foreground" />
                Validation Gate
              </button>
              {validationExpanded && (
                <div className="pl-5 space-y-3">
                  <Select
                    value={transition.validation.type}
                    onValueChange={(value) =>
                      onTransitionChange({
                        ...transition,
                        validation: {
                          type: value as ValidationMode["type"],
                          keyword:
                            value === "KEYWORD"
                              ? transition.validation.keyword || "APPROVED"
                              : undefined,
                        },
                      })
                    }
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">
                        <div className="flex flex-col">
                          <span>None</span>
                          <span className="text-xs text-muted-foreground">
                            Automatic transition
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="KEYWORD">
                        <div className="flex flex-col">
                          <span>Keyword</span>
                          <span className="text-xs text-muted-foreground">
                            User must type keyword
                          </span>
                        </div>
                      </SelectItem>
                      <SelectItem value="PULL_REQUEST">
                        <div className="flex flex-col">
                          <span>Pull Request</span>
                          <span className="text-xs text-muted-foreground">
                            Blocked until PR merged
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  {transition.validation.type === "KEYWORD" && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Approval Keyword
                      </Label>
                      <input
                        className="w-full text-sm bg-background border rounded px-2 py-1.5 font-mono"
                        value={transition.validation.keyword || "APPROVED"}
                        onChange={(e) =>
                          onTransitionChange({
                            ...transition,
                            validation: {
                              ...transition.validation,
                              keyword: e.target.value,
                            },
                          })
                        }
                        placeholder="APPROVED"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        {onDelete && (
          <div className="p-4 border-t">
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Transition
            </Button>
          </div>
        )}
      </div>
    );
  }

  return null;
}
