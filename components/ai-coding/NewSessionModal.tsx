"use client";

import { useState, useEffect } from "react";
import {
  Bot,
  Code,
  Sparkles,
  Wand2,
  Terminal,
  FolderOpen,
  Container,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  type AIAgent,
  AI_AGENTS,
  DEFAULT_CONTAINER_IMAGES,
} from "@/types/ai-session";
import { cn } from "@/lib/utils";

interface NewSessionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateSession: (options: {
    agent: AIAgent;
    containerImage?: string;
    workingDirectory?: string;
  }) => void;
  defaultWorkingDirectory?: string;
}

// Map icon names to components
const iconMap: Record<string, React.ElementType> = {
  Bot,
  Github: Code, // Fallback since Github icon may not be available
  Code,
  Sparkles,
  Zap: Wand2,
  Wand2,
  Gem: Sparkles,
  Terminal,
};

export function NewSessionModal({
  open,
  onOpenChange,
  onCreateSession,
  defaultWorkingDirectory = "/workspace",
}: NewSessionModalProps) {
  const [selectedAgent, setSelectedAgent] = useState<AIAgent>("claude-code");
  const [containerImage, setContainerImage] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState(
    defaultWorkingDirectory
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Sync workingDirectory state with prop when it changes
  useEffect(() => {
    setWorkingDirectory(defaultWorkingDirectory);
  }, [defaultWorkingDirectory]);

  const handleCreate = () => {
    onCreateSession({
      agent: selectedAgent,
      containerImage: containerImage || undefined,
      workingDirectory: workingDirectory || defaultWorkingDirectory,
    });
    // Reset form
    setContainerImage("");
    setWorkingDirectory(defaultWorkingDirectory);
    setShowAdvanced(false);
    onOpenChange(false);
  };

  const agentEntries = Object.entries(AI_AGENTS) as [
    AIAgent,
    { name: string; command: string; icon: string }
  ][];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            New AI Session
          </DialogTitle>
          <DialogDescription>
            Create a new AI coding session. Select an agent and optionally
            customize the container settings.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Agent Selection */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">Select AI Agent</Label>
            <RadioGroup
              value={selectedAgent}
              onValueChange={(value) => setSelectedAgent(value as AIAgent)}
              className="grid gap-2"
            >
              {agentEntries.map(([agentId, info]) => {
                const IconComponent = iconMap[info.icon] || Bot;
                return (
                  <div
                    key={agentId}
                    className={cn(
                      "flex items-center space-x-3 rounded-md border p-3 cursor-pointer transition-colors",
                      selectedAgent === agentId
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                    onClick={() => setSelectedAgent(agentId)}
                  >
                    <RadioGroupItem value={agentId} id={agentId} />
                    <Label
                      htmlFor={agentId}
                      className="flex items-center gap-3 cursor-pointer flex-1"
                    >
                      <IconComponent className="h-5 w-5 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="font-medium">{info.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Command: {info.command}
                        </div>
                      </div>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>

          {/* Advanced Options Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full justify-start text-muted-foreground"
          >
            {showAdvanced ? "Hide" : "Show"} Advanced Options
          </Button>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="space-y-4 rounded-md border p-4 bg-muted/30">
              {/* Container Image Override */}
              <div className="space-y-2">
                <Label htmlFor="container-image" className="flex items-center gap-2">
                  <Container className="h-4 w-4" />
                  Container Image
                </Label>
                <Input
                  id="container-image"
                  placeholder={DEFAULT_CONTAINER_IMAGES[selectedAgent]}
                  value={containerImage}
                  onChange={(e) => setContainerImage(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the server&apos;s default container image (flowspec variant)
                </p>
              </div>

              {/* Working Directory */}
              <div className="space-y-2">
                <Label htmlFor="working-dir" className="flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  Working Directory
                </Label>
                <Input
                  id="working-dir"
                  placeholder="/workspace"
                  value={workingDirectory}
                  onChange={(e) => setWorkingDirectory(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  The directory where the AI agent will start
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate}>
            <Bot className="h-4 w-4 mr-2" />
            Create Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default NewSessionModal;
