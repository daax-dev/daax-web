"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import CreateOptions from "./create-options";

// Quickstart templates using standard MCR images
const QUICKSTART_TEMPLATES = [
  {
    id: "node",
    name: "Node.js",
    description: "JavaScript/TypeScript development with Node.js",
    image: "mcr.microsoft.com/devcontainers/javascript-node:22",
    icon: "/icons/languages/nodejs.svg",
    features: ["node", "git"],
  },
  {
    id: "python",
    name: "Python",
    description: "Python development with pip and common tools",
    image: "mcr.microsoft.com/devcontainers/python:3.12",
    icon: "/icons/languages/python.svg",
    features: ["python", "git"],
  },
  {
    id: "go",
    name: "Go",
    description: "Go development with standard tooling",
    image: "mcr.microsoft.com/devcontainers/go:1.22",
    icon: "/icons/languages/go.svg",
    features: ["go", "git"],
  },
  {
    id: "rust",
    name: "Rust",
    description: "Rust development with cargo and common tools",
    image: "mcr.microsoft.com/devcontainers/rust:1",
    icon: "/icons/languages/rust.svg",
    features: ["rust", "git"],
  },
  {
    id: "java",
    name: "Java",
    description: "Java development with JDK and Maven/Gradle",
    image: "mcr.microsoft.com/devcontainers/java:21",
    icon: "/icons/languages/java.svg",
    features: ["java", "maven", "git"],
  },
  {
    id: "dotnet",
    name: ".NET",
    description: "C# and .NET development",
    image: "mcr.microsoft.com/devcontainers/dotnet:8.0",
    icon: "/icons/languages/dotnet.svg",
    features: ["dotnet", "git"],
  },
];

export default function QuickstartPicker() {
  const [selected, setSelected] = useState<string | null>(null);

  const selectedTemplate = QUICKSTART_TEMPLATES.find((t) => t.id === selected);

  if (selectedTemplate) {
    // Build devcontainer config from template
    const devcontainerConfig = {
      name: `${selectedTemplate.name} Dev Container`,
      image: selectedTemplate.image,
      features: {
        "ghcr.io/devcontainers/features/git:1": {},
      },
      customizations: {
        vscode: {
          extensions: getDefaultExtensions(selectedTemplate.id),
        },
      },
    };

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Image
            src={selectedTemplate.icon}
            alt={selectedTemplate.name}
            width={40}
            height={40}
            className="h-10 w-10"
          />
          <div>
            <h3 className="text-lg font-semibold">{selectedTemplate.name}</h3>
            <p className="text-sm text-muted-foreground">
              {selectedTemplate.description}
            </p>
          </div>
          <button
            onClick={() => setSelected(null)}
            className="ml-auto text-sm text-muted-foreground hover:text-foreground"
          >
            Change template
          </button>
        </div>

        <CreateOptions devcontainerConfig={devcontainerConfig} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Choose a Template</h3>
        <p className="text-sm text-muted-foreground">
          Select a pre-configured development environment
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {QUICKSTART_TEMPLATES.map((template) => (
          <Card
            key={template.id}
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50",
              selected === template.id &&
                "border-primary ring-2 ring-primary/20",
            )}
            onClick={() => setSelected(template.id)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <Image
                  src={template.icon}
                  alt={template.name}
                  width={32}
                  height={32}
                  className="h-8 w-8"
                />
                {selected === template.id && (
                  <Check className="h-5 w-5 text-primary" />
                )}
              </div>
              <CardTitle className="text-base">{template.name}</CardTitle>
              <CardDescription className="text-xs">
                {template.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex flex-wrap gap-1">
                {template.features.map((f) => (
                  <Badge key={f} variant="secondary" className="text-xs">
                    {f}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function getDefaultExtensions(templateId: string): string[] {
  const extensionMap: Record<string, string[]> = {
    node: ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"],
    python: ["ms-python.python", "ms-python.vscode-pylance"],
    go: ["golang.go"],
    rust: ["rust-lang.rust-analyzer"],
    java: ["vscjava.vscode-java-pack"],
    dotnet: ["ms-dotnettools.csharp", "ms-dotnettools.csdevkit"],
  };
  return extensionMap[templateId] || [];
}
