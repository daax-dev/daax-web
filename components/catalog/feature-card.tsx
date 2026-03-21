"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  Zap,
  Clock,
  Timer,
  Settings2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Feature, FeatureOption, FeatureSelection } from "@/types/catalog";
import { FEATURE_CATEGORY_CONFIG } from "@/types/catalog";

// Icon mapping for features
const FEATURE_ICONS: Record<string, string> = {
  terminal: "💻",
  docker: "🐳",
  git: "📝",
  github: "🐙",
  nodejs: "🟢",
  python: "🐍",
  go: "🔵",
  rust: "🦀",
  aws: "☁️",
  azure: "🔷",
  gcp: "🌐",
  kubernetes: "☸️",
  terraform: "🏗️",
};

const INSTALL_TIME_CONFIG = {
  fast: { icon: Zap, label: "Fast", color: "text-green-500" },
  medium: { icon: Clock, label: "Medium", color: "text-yellow-500" },
  slow: { icon: Timer, label: "Slow", color: "text-orange-500" },
};

interface FeatureCardProps {
  feature: Feature;
  selected?: boolean;
  selection?: FeatureSelection;
  onAdd?: (selection: FeatureSelection) => void;
  onRemove?: () => void;
  onUpdateOptions?: (options: Record<string, string | boolean>) => void;
  compact?: boolean;
}

export function FeatureCard({
  feature,
  selected,
  selection,
  onAdd,
  onRemove,
  onUpdateOptions,
  compact,
}: FeatureCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [localOptions, setLocalOptions] = useState<
    Record<string, string | boolean>
  >(() => {
    if (selection) return selection.options;
    // Initialize with defaults
    const defaults: Record<string, string | boolean> = {};
    feature.options.forEach((opt) => {
      defaults[opt.id] = opt.default;
    });
    return defaults;
  });

  const categoryConfig = FEATURE_CATEGORY_CONFIG[feature.category];
  const installTimeConfig = INSTALL_TIME_CONFIG[feature.installTime];
  const InstallTimeIcon = installTimeConfig.icon;
  const icon = FEATURE_ICONS[feature.icon] || "📦";

  const handleOptionChange = (optionId: string, value: string | boolean) => {
    const newOptions = { ...localOptions, [optionId]: value };
    setLocalOptions(newOptions);
    if (selected) {
      onUpdateOptions?.(newOptions);
    }
  };

  const handleAdd = () => {
    onAdd?.({
      featureId: feature.id,
      version: feature.versions[0]?.tag || "latest",
      options: localOptions,
    });
  };

  if (compact) {
    return (
      <Card
        className={cn(
          "cursor-pointer transition-all hover:border-primary/50",
          selected && "border-primary ring-1 ring-primary",
        )}
      >
        <CardHeader className="p-3 pb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xs truncate">{feature.name}</CardTitle>
            </div>
            {selected ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.();
                }}
              >
                <Check className="h-3 w-3 text-primary" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAdd();
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <Badge
            variant="outline"
            className={cn("text-[10px]", categoryConfig.color)}
          >
            {categoryConfig.label}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "transition-all",
        selected && "border-primary ring-1 ring-primary",
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-2xl">
              {icon}
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {feature.name}
                <Badge
                  variant="outline"
                  className={cn("text-[10px]", categoryConfig.color)}
                >
                  {categoryConfig.label}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1">
                {feature.description}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={cn(
                "flex items-center gap-1 text-xs",
                installTimeConfig.color,
              )}
            >
              <InstallTimeIcon className="h-3 w-3" />
              <span>{installTimeConfig.label}</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {feature.tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 bg-muted rounded"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {feature.conflicts && feature.conflicts.length > 0 && (
              <span className="text-orange-500">
                Conflicts: {feature.conflicts.join(", ")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {feature.options.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
              >
                <Settings2 className="h-4 w-4 mr-1" />
                Options
                {expanded ? (
                  <ChevronDown className="h-4 w-4 ml-1" />
                ) : (
                  <ChevronRight className="h-4 w-4 ml-1" />
                )}
              </Button>
            )}
            {selected ? (
              <Button variant="outline" size="sm" onClick={onRemove}>
                Remove
              </Button>
            ) : (
              <Button size="sm" onClick={handleAdd}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            )}
          </div>
        </div>

        {/* Options (Expanded) */}
        {expanded && feature.options.length > 0 && (
          <div className="mt-4 space-y-4 border-t pt-4">
            <h4 className="text-sm font-medium">Configuration Options</h4>
            {feature.options.map((option) => (
              <OptionField
                key={option.id}
                option={option}
                value={localOptions[option.id]}
                onChange={(value) => handleOptionChange(option.id, value)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface OptionFieldProps {
  option: FeatureOption;
  value: string | boolean;
  onChange: (value: string | boolean) => void;
}

function OptionField({ option, value, onChange }: OptionFieldProps) {
  if (option.type === "boolean") {
    return (
      <div className="flex items-center justify-between">
        <div>
          <Label htmlFor={option.id}>{option.name}</Label>
          {option.description && (
            <p className="text-xs text-muted-foreground">
              {option.description}
            </p>
          )}
        </div>
        <Switch
          id={option.id}
          checked={value as boolean}
          onCheckedChange={onChange}
        />
      </div>
    );
  }

  if (option.type === "enum" && option.enum) {
    return (
      <div className="space-y-2">
        <Label htmlFor={option.id}>{option.name}</Label>
        {option.description && (
          <p className="text-xs text-muted-foreground">{option.description}</p>
        )}
        <Select value={value as string} onValueChange={onChange}>
          <SelectTrigger id={option.id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {option.enum.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={option.id}>{option.name}</Label>
      {option.description && (
        <p className="text-xs text-muted-foreground">{option.description}</p>
      )}
      <Input
        id={option.id}
        value={value as string}
        onChange={(e) => onChange(e.target.value)}
        placeholder={String(option.default)}
      />
    </div>
  );
}
