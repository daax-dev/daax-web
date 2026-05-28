/**
 * Test Containers Catalog Page
 *
 * Browse and launch container templates.
 */

"use client";

import { useState } from "react";
import {
  Database,
  MessageSquare,
  Zap,
  Server,
  Settings,
  Play,
  ArrowLeft,
  Search,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTemplates, useContainers } from "@/plugins/testcontainers/hooks";
import type {
  ContainerTemplate,
  TemplateCategory,
} from "@/plugins/testcontainers/types";

const categoryIcons: Record<
  TemplateCategory,
  React.ComponentType<{ className?: string }>
> = {
  database: Database,
  messaging: MessageSquare,
  cache: Zap,
  service: Server,
  custom: Settings,
};

const categoryLabels: Record<TemplateCategory, string> = {
  database: "Databases",
  messaging: "Message Queues",
  cache: "Caching",
  service: "Services",
  custom: "Custom",
};

function TemplateCard({
  template,
  onLaunch,
  launching,
}: {
  template: ContainerTemplate;
  onLaunch: (template: ContainerTemplate) => void;
  launching: string | null;
}) {
  const Icon = categoryIcons[template.category];
  const isLaunching = launching === template.id;

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-muted p-2">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">{template.name}</CardTitle>
              <p className="text-xs text-muted-foreground font-mono">
                {template.image}:{template.tag}
              </p>
            </div>
          </div>
          {template.official && (
            <Badge variant="secondary" className="text-xs">
              Official
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="mb-4 line-clamp-2">
          {template.description}
        </CardDescription>

        <div className="flex items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {template.ports.slice(0, 3).map((port) => (
              <Badge
                key={port.containerPort}
                variant="outline"
                className="text-xs"
              >
                {port.containerPort}/{port.protocol}
              </Badge>
            ))}
            {template.ports.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{template.ports.length - 3}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => onLaunch(template)}
              disabled={isLaunching}
            >
              {isLaunching ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Launch
            </Button>
          </div>
        </div>

        {template.estimatedMemoryMb && (
          <p className="text-xs text-muted-foreground mt-2">
            ~{template.estimatedMemoryMb}MB memory
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function CatalogPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [launching, setLaunching] = useState<string | null>(null);

  const { templatesByCategory, loading, error } = useTemplates();
  const { createContainer } = useContainers({ autoRefresh: false });

  const handleLaunch = async (template: ContainerTemplate) => {
    setLaunching(template.id);
    try {
      await createContainer({
        templateId: template.id,
        image: template.image,
        tag: template.tag,
        ports: template.ports,
        environment: template.environment,
        volumes: template.volumes,
      });
      toast.success(`${template.name} launched successfully`);
      router.push("/testcontainers");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to launch container",
      );
    } finally {
      setLaunching(null);
    }
  };

  // Filter templates
  const filteredTemplates = Object.entries(templatesByCategory).reduce(
    (acc, [category, templates]) => {
      const filtered = templates.filter(
        (t) =>
          (activeCategory === "all" || category === activeCategory) &&
          (search === "" ||
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.description.toLowerCase().includes(search.toLowerCase())),
      );
      if (filtered.length > 0) {
        acc[category as TemplateCategory] = filtered;
      }
      return acc;
    },
    {} as Record<TemplateCategory, ContainerTemplate[]>,
  );

  const totalFiltered = Object.values(filteredTemplates).flat().length;

  return (
    <div className="container py-6">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/testcontainers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Container Catalog</h1>
          <p className="text-muted-foreground">
            Pre-configured templates for common services
          </p>
        </div>
      </div>

      {/* Search and filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search templates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {totalFiltered} template{totalFiltered !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Category tabs */}
      <Tabs
        value={activeCategory}
        onValueChange={setActiveCategory}
        className="mb-6"
      >
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          {Object.entries(categoryLabels).map(([key, label]) => (
            <TabsTrigger key={key} value={key}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-6">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Templates grid */}
      {!loading && (
        <div className="space-y-8">
          {Object.entries(filteredTemplates).map(([category, templates]) => {
            const Icon = categoryIcons[category as TemplateCategory];
            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-4">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold">
                    {categoryLabels[category as TemplateCategory]}
                  </h2>
                  <Badge variant="secondary">{templates.length}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((template) => (
                    <TemplateCard
                      key={template.id}
                      template={template}
                      onLaunch={handleLaunch}
                      launching={launching}
                    />
                  ))}
                </div>
              </div>
            );
          })}

          {totalFiltered === 0 && !loading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">
                No templates match your search.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
