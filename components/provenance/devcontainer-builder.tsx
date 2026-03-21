"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, X, Terminal, Wrench, Layers, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import CreateOptions from "./create-options";
import {
  getEnabledBaseImages,
  getEnabledFeatures,
  subscribeToDevcontainerSettings,
  type DevcontainerBaseImage,
  type DevcontainerFeature,
} from "@/lib/devcontainer-settings";

// Suggested VS Code extensions by category
const EXTENSION_SUGGESTIONS = [
  { id: "eslint", name: "ESLint", extension: "dbaeumer.vscode-eslint" },
  { id: "prettier", name: "Prettier", extension: "esbenp.prettier-vscode" },
  { id: "gitlens", name: "GitLens", extension: "eamodio.gitlens" },
  { id: "docker", name: "Docker", extension: "ms-azuretools.vscode-docker" },
  {
    id: "remote-containers",
    name: "Dev Containers",
    extension: "ms-vscode-remote.remote-containers",
  },
  { id: "copilot", name: "GitHub Copilot", extension: "github.copilot" },
  {
    id: "copilot-chat",
    name: "GitHub Copilot Chat",
    extension: "github.copilot-chat",
  },
];

// Helper to get initial selected image
function getInitialSelectedImage(): string {
  const images = getEnabledBaseImages();
  return images.length > 0 ? images[0].id : "";
}

export default function DevcontainerBuilder() {
  // Load enabled base images and features from settings
  const [baseImages, setBaseImages] =
    useState<DevcontainerBaseImage[]>(getEnabledBaseImages);
  const [availableFeatures, setAvailableFeatures] =
    useState<DevcontainerFeature[]>(getEnabledFeatures);

  const [containerName, setContainerName] = useState("my-dev-container");
  const [selectedImage, setSelectedImage] = useState(getInitialSelectedImage);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>(["git"]);
  const [selectedExtensions, setSelectedExtensions] = useState<string[]>([]);
  const [ports, setPorts] = useState<string[]>([]);
  const [newPort, setNewPort] = useState("");
  const [postCreateCommand, setPostCreateCommand] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  // Subscribe to settings changes
  useEffect(() => {
    const unsubscribe = subscribeToDevcontainerSettings(() => {
      const newImages = getEnabledBaseImages();
      setBaseImages(newImages);
      setAvailableFeatures(getEnabledFeatures());
      // Update selected image if current selection is no longer available
      if (
        newImages.length > 0 &&
        !newImages.find((img) => img.id === selectedImage)
      ) {
        setSelectedImage(newImages[0].id);
      }
    });
    return unsubscribe;
  }, [selectedImage]);

  const toggleFeature = (featureId: string) => {
    setEnabledFeatures((prev) =>
      prev.includes(featureId)
        ? prev.filter((f) => f !== featureId)
        : [...prev, featureId],
    );
  };

  const toggleExtension = (extensionId: string) => {
    setSelectedExtensions((prev) =>
      prev.includes(extensionId)
        ? prev.filter((e) => e !== extensionId)
        : [...prev, extensionId],
    );
  };

  const addPort = () => {
    if (newPort && !ports.includes(newPort)) {
      setPorts([...ports, newPort]);
      setNewPort("");
    }
  };

  const removePort = (port: string) => {
    setPorts(ports.filter((p) => p !== port));
  };

  // Build the devcontainer config
  const buildConfig = () => {
    const imageObj = baseImages.find((i) => i.id === selectedImage);
    const features: Record<string, Record<string, unknown>> = {};

    enabledFeatures.forEach((featureId) => {
      const feature = availableFeatures.find((f) => f.id === featureId);
      if (feature) {
        features[feature.feature] = {};
      }
    });

    const extensions = selectedExtensions
      .map((extId) => {
        const ext = EXTENSION_SUGGESTIONS.find((e) => e.id === extId);
        return ext?.extension || "";
      })
      .filter(Boolean);

    const config: Record<string, unknown> = {
      name: containerName,
      image: imageObj?.image,
    };

    if (Object.keys(features).length > 0) {
      config.features = features;
    }

    if (ports.length > 0) {
      config.forwardPorts = ports.map((p) => parseInt(p, 10));
    }

    if (extensions.length > 0) {
      config.customizations = {
        vscode: {
          extensions,
        },
      };
    }

    if (postCreateCommand.trim()) {
      config.postCreateCommand = postCreateCommand.trim();
    }

    return config;
  };

  const devcontainerConfig = buildConfig();

  if (showPreview) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => setShowPreview(false)}>
          Back to Editor
        </Button>
        <CreateOptions devcontainerConfig={devcontainerConfig} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Container Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Container Name</Label>
        <Input
          id="name"
          value={containerName}
          onChange={(e) => setContainerName(e.target.value)}
          placeholder="my-dev-container"
        />
      </div>

      {/* Base Image Selection - Card Grid */}
      <div className="space-y-3">
        <div>
          <Label className="text-base">Base Image</Label>
          <p className="text-sm text-muted-foreground">
            Select your development environment
          </p>
        </div>
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {baseImages.map((img) => (
            <div
              key={img.id}
              onClick={() => setSelectedImage(img.id)}
              className={cn(
                "cursor-pointer p-3 border rounded-lg transition-all hover:border-primary/50 text-center",
                selectedImage === img.id &&
                  "border-primary ring-2 ring-primary/20 bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="h-8 w-8 rounded-md bg-muted/80 flex items-center justify-center">
                  <Image
                    src={img.icon}
                    alt={img.name}
                    width={20}
                    height={20}
                    className="h-5 w-5"
                  />
                </div>
                {selectedImage === img.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="text-sm font-medium truncate">{img.name}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {baseImages.find((i) => i.id === selectedImage)?.image}
        </p>
      </div>

      {/* Features */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Features
          </CardTitle>
          <CardDescription>Add development tools and utilities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {availableFeatures.map((feature) => (
              <div
                key={feature.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="space-y-0.5">
                  <Label
                    htmlFor={feature.id}
                    className="text-sm font-medium cursor-pointer"
                  >
                    {feature.name}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
                <Switch
                  id={feature.id}
                  checked={enabledFeatures.includes(feature.id)}
                  onCheckedChange={() => toggleFeature(feature.id)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Accordion for additional settings */}
      <Accordion type="multiple" className="w-full">
        {/* VS Code Extensions */}
        <AccordionItem value="extensions">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4" />
              VS Code Extensions
              {selectedExtensions.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {selectedExtensions.length}
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2">
              {EXTENSION_SUGGESTIONS.map((ext) => (
                <div
                  key={ext.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <Label htmlFor={ext.id} className="text-sm cursor-pointer">
                    {ext.name}
                  </Label>
                  <Switch
                    id={ext.id}
                    checked={selectedExtensions.includes(ext.id)}
                    onCheckedChange={() => toggleExtension(ext.id)}
                  />
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Port Forwarding */}
        <AccordionItem value="ports">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Port Forwarding
              {ports.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {ports.length}
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="space-y-3 pt-2">
              <div className="flex gap-2">
                <Input
                  placeholder="3000"
                  value={newPort}
                  onChange={(e) => setNewPort(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPort()}
                  className="w-24"
                />
                <Button variant="outline" size="sm" onClick={addPort}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {ports.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ports.map((port) => (
                    <Badge key={port} variant="secondary" className="gap-1">
                      {port}
                      <button onClick={() => removePort(port)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Post Create Command */}
        <AccordionItem value="post-create">
          <AccordionTrigger>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4" />
              Post Create Command
            </div>
          </AccordionTrigger>
          <AccordionContent>
            <div className="pt-2">
              <Textarea
                placeholder="npm install"
                value={postCreateCommand}
                onChange={(e) => setPostCreateCommand(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Command to run after the container is created
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Generate Button */}
      <Button onClick={() => setShowPreview(true)} className="w-full" size="lg">
        Generate DevContainer
      </Button>
    </div>
  );
}
