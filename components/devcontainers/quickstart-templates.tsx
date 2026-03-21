"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, ArrowLeft, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getEnabledTemplates,
  getEnabledBaseImages,
  subscribeToDevcontainerSettings,
  type DevcontainerTemplate,
  type DevcontainerBaseImage,
} from "@/lib/devcontainer-settings";
import CreateOptions from "@/components/provenance/create-options";

// Pagination: 2 rows of 4 = 8 templates per page
const TEMPLATES_PER_ROW = 4;
const TEMPLATES_ROWS = 2;
const TEMPLATES_PER_PAGE = TEMPLATES_PER_ROW * TEMPLATES_ROWS;

// Pagination controls component
function PaginationControls({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onPrev}
        disabled={page === 0}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span className="text-sm text-muted-foreground min-w-[3rem] text-center">
        {page + 1} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={onNext}
        disabled={page >= totalPages - 1}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function QuickstartTemplates() {
  const [templates, setTemplates] =
    useState<DevcontainerTemplate[]>(getEnabledTemplates);
  const [baseImages, setBaseImages] =
    useState<DevcontainerBaseImage[]>(getEnabledBaseImages);

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Pagination state
  const [templatePage, setTemplatePage] = useState(0);

  // Preview dialog state
  const [previewTemplate, setPreviewTemplate] =
    useState<DevcontainerTemplate | null>(null);

  // Subscribe to settings changes
  useEffect(() => {
    const unsubscribe = subscribeToDevcontainerSettings(() => {
      setTemplates(getEnabledTemplates());
      setBaseImages(getEnabledBaseImages());
    });
    return unsubscribe;
  }, []);

  // Paginated data
  const paginatedTemplates = useMemo(() => {
    const start = templatePage * TEMPLATES_PER_PAGE;
    return templates.slice(start, start + TEMPLATES_PER_PAGE);
  }, [templates, templatePage]);

  const totalTemplatePages = Math.ceil(templates.length / TEMPLATES_PER_PAGE);

  // Map template to corresponding base image
  const getImageForTemplate = (
    templateId: string,
  ): DevcontainerBaseImage | undefined => {
    const mapping: Record<string, string[]> = {
      "javascript-node": ["node-22", "node-20", "node-18"],
      "typescript-node": [
        "typescript-node-22",
        "typescript-node-20",
        "node-22",
      ],
      python: ["python-3.12", "python-3.11", "python-3.10"],
      anaconda: ["anaconda"],
      miniconda: ["miniconda"],
      go: ["go-1.22", "go-1.21", "go-1.20"],
      rust: ["rust-1"],
      java: ["java-21", "java-17", "java-11"],
      "java-8": ["java-8"],
      dotnet: ["dotnet-8", "dotnet-7", "dotnet-6"],
      cpp: ["cpp"],
      php: ["php-8.3", "php-8.2", "php-8.1"],
      ruby: ["ruby-3.3", "ruby-3.2", "ruby-3.1"],
      jekyll: ["jekyll"],
      ubuntu: ["base-ubuntu"],
      debian: ["base-debian"],
      alpine: ["base-alpine"],
      universal: ["universal"],
    };

    const imageIds = mapping[templateId] || [];
    for (const id of imageIds) {
      const img = baseImages.find((i) => i.id === id);
      if (img) return img;
    }
    return baseImages[0];
  };

  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate);
  const selectedImage = selectedTemplateObj
    ? getImageForTemplate(selectedTemplateObj.id)
    : undefined;

  // Build the devcontainer config for selected template (complete as-is, no extra features)
  const buildConfig = () => {
    if (!selectedTemplateObj || !selectedImage) return null;

    return {
      name: `${selectedTemplateObj.name} Development`,
      image: selectedImage.image,
    };
  };

  const devcontainerConfig = buildConfig();

  // Reset to template selection
  const handleBack = () => {
    setShowCreate(false);
  };

  // Preview dialog content
  const renderPreviewContent = () => {
    if (!previewTemplate) return null;

    const image = getImageForTemplate(previewTemplate.id);
    const previewConfig = {
      name: `${previewTemplate.name} Development`,
      image: image?.image || "mcr.microsoft.com/devcontainers/base:ubuntu",
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center">
            <Image
              src={previewTemplate.icon}
              alt={previewTemplate.name}
              width={32}
              height={32}
            />
          </div>
          <div>
            <h4 className="font-medium">{previewTemplate.name}</h4>
            <p className="text-sm text-muted-foreground">
              {previewTemplate.description}
            </p>
          </div>
        </div>
        {image && (
          <div>
            <div className="text-sm font-medium mb-1">Base Image</div>
            <code className="text-xs bg-muted px-2 py-1 rounded block">
              {image.image}
            </code>
          </div>
        )}
        <div>
          <div className="text-sm font-medium mb-2">devcontainer.json</div>
          <pre className="bg-muted p-3 rounded-lg text-xs overflow-auto max-h-48">
            <code>{JSON.stringify(previewConfig, null, 2)}</code>
          </pre>
        </div>
      </div>
    );
  };

  // Show create options after selecting template
  if (showCreate && selectedTemplateObj && devcontainerConfig) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Templates
        </Button>
        <CreateOptions
          devcontainerConfig={devcontainerConfig}
          selectedTemplate={selectedTemplateObj}
          selectedImage={selectedImage}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Preview Dialog */}
      <Dialog
        open={!!previewTemplate}
        onOpenChange={(open) => !open && setPreviewTemplate(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Template Details</DialogTitle>
            <DialogDescription>
              This template is ready to use as-is
            </DialogDescription>
          </DialogHeader>
          {renderPreviewContent()}
        </DialogContent>
      </Dialog>

      {/* Templates Section - 2 rows of 4 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Choose a Template</CardTitle>
              <CardDescription>
                Templates are complete, ready-to-use configurations. For custom
                builds with base images and features, use the Custom Build tab.
              </CardDescription>
            </div>
            {totalTemplatePages > 1 && (
              <PaginationControls
                page={templatePage}
                totalPages={totalTemplatePages}
                onPrev={() => setTemplatePage((p) => Math.max(0, p - 1))}
                onNext={() =>
                  setTemplatePage((p) =>
                    Math.min(totalTemplatePages - 1, p + 1),
                  )
                }
              />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            {paginatedTemplates.map((template) => (
              <div
                key={template.id}
                className={cn(
                  "relative p-3 border rounded-lg transition-all",
                  selectedTemplate === template.id
                    ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                    : "hover:border-primary/50",
                )}
              >
                {/* View button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewTemplate(template);
                  }}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-muted"
                  title="View details"
                >
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </button>

                {/* Clickable card content */}
                <div
                  onClick={() => setSelectedTemplate(template.id)}
                  className="cursor-pointer"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-8 w-8 rounded bg-muted/80 flex items-center justify-center">
                      <Image
                        src={template.icon}
                        alt={template.name}
                        width={20}
                        height={20}
                        className="h-5 w-5"
                      />
                    </div>
                    {selectedTemplate === template.id && (
                      <Check className="h-4 w-4 text-primary ml-auto" />
                    )}
                  </div>
                  <div className="text-sm font-medium truncate">
                    {template.name}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1">
                    {template.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Use Template Button */}
      <Button
        onClick={() => setShowCreate(true)}
        className="w-full"
        size="lg"
        disabled={!selectedTemplate}
      >
        {selectedTemplate
          ? `Use ${selectedTemplateObj?.name}`
          : "Select a template to continue"}
      </Button>
    </div>
  );
}
