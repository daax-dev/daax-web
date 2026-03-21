"use client";

/**
 * DevContainer Admin Component
 *
 * Provides UI for configuring devcontainer settings:
 * - Repository source URLs (templates, images, features)
 * - Enable/disable base images, features, and templates
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  Layers,
  FileCode,
  Settings,
  RefreshCw,
  ExternalLink,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  getDevcontainerSettings,
  saveDevcontainerSettings,
  toggleBaseImage,
  toggleFeature,
  toggleTemplate,
  resetDevcontainerSettings,
  subscribeToDevcontainerSettings,
  DEFAULT_REPOS,
  type DevcontainerSettings,
  type DevcontainerBaseImage,
  type DevcontainerFeature,
  type DevcontainerTemplate,
} from "@/lib/devcontainer-settings";
import { cn } from "@/lib/utils";

// ============================================================================
// Repository Settings Tab
// ============================================================================

interface RepoSettingsProps {
  settings: DevcontainerSettings;
  onSave: (repos: DevcontainerSettings["repos"]) => void;
}

function RepoSettings({ settings, onSave }: RepoSettingsProps) {
  const [repos, setRepos] = useState(settings.repos);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(repos);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setRepos(DEFAULT_REPOS);
    onSave(DEFAULT_REPOS);
  };

  const isModified = JSON.stringify(repos) !== JSON.stringify(DEFAULT_REPOS);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Repository Sources</h3>
          <p className="text-sm text-muted-foreground">
            Configure the GitHub repositories to fetch devcontainer resources
            from
          </p>
        </div>
        {isModified && (
          <Badge
            variant="outline"
            className="text-orange-500 border-orange-500"
          >
            Modified
          </Badge>
        )}
      </div>

      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="templates-repo" className="flex items-center gap-2">
            <FileCode className="h-4 w-4" />
            Templates Repository
          </Label>
          <div className="flex gap-2">
            <Input
              id="templates-repo"
              value={repos.templates}
              onChange={(e) =>
                setRepos({ ...repos, templates: e.target.value })
              }
              placeholder="devcontainers/templates"
            />
            <Button variant="outline" size="icon" asChild>
              <a
                href={`https://github.com/${repos.templates}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Default: {DEFAULT_REPOS.templates}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="images-repo" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Base Images Repository
          </Label>
          <div className="flex gap-2">
            <Input
              id="images-repo"
              value={repos.images}
              onChange={(e) => setRepos({ ...repos, images: e.target.value })}
              placeholder="devcontainers/images"
            />
            <Button variant="outline" size="icon" asChild>
              <a
                href={`https://github.com/${repos.images}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Default: {DEFAULT_REPOS.images}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="features-repo" className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Features Repository
          </Label>
          <div className="flex gap-2">
            <Input
              id="features-repo"
              value={repos.features}
              onChange={(e) => setRepos({ ...repos, features: e.target.value })}
              placeholder="devcontainers/features"
            />
            <Button variant="outline" size="icon" asChild>
              <a
                href={`https://github.com/${repos.features}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Default: {DEFAULT_REPOS.features}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-4 border-t">
        <Button onClick={handleSave}>
          {saved ? (
            <>
              <Check className="h-4 w-4 mr-2" />
              Saved
            </>
          ) : (
            "Save Changes"
          )}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
      </div>
    </div>
  );
}

// ============================================================================
// Base Images Tab
// ============================================================================

interface BaseImagesTabProps {
  images: DevcontainerBaseImage[];
  onToggle: (id: string) => void;
}

function BaseImagesTab({ images, onToggle }: BaseImagesTabProps) {
  const [saved, setSaved] = useState(false);
  const enabledCount = images.filter((img) => img.enabled).length;

  const handleToggle = (id: string) => {
    onToggle(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Base Images</h3>
          <p className="text-sm text-muted-foreground">
            Enable or disable base images shown in the DevContainer Builder
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <Badge
              variant="outline"
              className="text-green-500 border-green-500"
            >
              <Check className="h-3 w-3 mr-1" />
              Saved
            </Badge>
          )}
          <Badge variant="outline">
            {enabledCount}/{images.length} enabled
          </Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {images.map((img) => (
          <div
            key={img.id}
            className={cn(
              "relative p-4 rounded-lg border transition-all",
              img.enabled
                ? "border-green-500/50 bg-green-500/5"
                : "border-muted bg-muted/30 opacity-60",
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-muted/80 flex items-center justify-center">
                  <Image
                    src={img.icon}
                    alt={img.name}
                    width={24}
                    height={24}
                    className="h-6 w-6"
                  />
                </div>
                <div>
                  <div className="font-medium">{img.name}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                    {img.image}
                  </div>
                </div>
              </div>
              <Switch
                checked={img.enabled}
                onCheckedChange={() => handleToggle(img.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Features Tab
// ============================================================================

interface FeaturesTabProps {
  features: DevcontainerFeature[];
  onToggle: (id: string) => void;
}

function FeaturesTab({ features, onToggle }: FeaturesTabProps) {
  const [saved, setSaved] = useState(false);
  const [page, setPage] = useState(0);
  const ITEMS_PER_PAGE = 10;
  const enabledCount = features.filter((f) => f.enabled).length;
  const totalPages = Math.ceil(features.length / ITEMS_PER_PAGE);

  const handleToggle = (id: string) => {
    onToggle(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const paginatedFeatures = features.slice(
    page * ITEMS_PER_PAGE,
    (page + 1) * ITEMS_PER_PAGE,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">DevContainer Features</h3>
          <p className="text-sm text-muted-foreground">
            Enable or disable features shown in the DevContainer Builder
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <Badge
              variant="outline"
              className="text-green-500 border-green-500"
            >
              <Check className="h-3 w-3 mr-1" />
              Saved
            </Badge>
          )}
          <Badge variant="outline">
            {enabledCount}/{features.length} enabled
          </Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {paginatedFeatures.map((feature) => (
          <div
            key={feature.id}
            className={cn(
              "relative p-4 rounded-lg border transition-all",
              feature.enabled
                ? "border-green-500/50 bg-green-500/5"
                : "border-muted bg-muted/30 opacity-60",
            )}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-medium">{feature.name}</div>
                <div className="text-sm text-muted-foreground mb-2">
                  {feature.description}
                </div>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {feature.feature}
                </code>
              </div>
              <Switch
                checked={feature.enabled}
                onCheckedChange={() => handleToggle(feature.id)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4 border-t">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground px-4">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Templates Tab
// ============================================================================

interface TemplatesTabProps {
  templates: DevcontainerTemplate[];
  onToggle: (id: string) => void;
}

function TemplatesTab({ templates, onToggle }: TemplatesTabProps) {
  const [saved, setSaved] = useState(false);
  const enabledCount = templates.filter((t) => t.enabled).length;

  const handleToggle = (id: string) => {
    onToggle(id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">DevContainer Templates</h3>
          <p className="text-sm text-muted-foreground">
            Enable or disable templates for quickstart options
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <Badge
              variant="outline"
              className="text-green-500 border-green-500"
            >
              <Check className="h-3 w-3 mr-1" />
              Saved
            </Badge>
          )}
          <Badge variant="outline">
            {enabledCount}/{templates.length} enabled
          </Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className={cn(
              "relative p-4 rounded-lg border transition-all",
              template.enabled
                ? "border-green-500/50 bg-green-500/5"
                : "border-muted bg-muted/30 opacity-60",
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-md bg-muted/80 flex items-center justify-center">
                  <Image
                    src={template.icon}
                    alt={template.name}
                    width={24}
                    height={24}
                    className="h-6 w-6"
                  />
                </div>
                <div>
                  <div className="font-medium">{template.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {template.description}
                  </div>
                </div>
              </div>
              <Switch
                checked={template.enabled}
                onCheckedChange={() => handleToggle(template.id)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function DevcontainerAdmin() {
  const [settings, setSettings] = useState<DevcontainerSettings>(
    getDevcontainerSettings,
  );

  useEffect(() => {
    // Subscribe to settings changes
    const unsubscribe = subscribeToDevcontainerSettings(setSettings);
    return unsubscribe;
  }, []);

  const handleSaveRepos = (repos: DevcontainerSettings["repos"]) => {
    saveDevcontainerSettings({ repos });
  };

  const handleResetAll = () => {
    resetDevcontainerSettings();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Changes are saved to browser localStorage
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleResetAll}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Reset All to Defaults
        </Button>
      </div>

      <Tabs defaultValue="repos" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="repos" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Repos</span>
          </TabsTrigger>
          <TabsTrigger value="images" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Images</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">Features</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileCode className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="repos" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <RepoSettings settings={settings} onSave={handleSaveRepos} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <BaseImagesTab
                images={settings.baseImages}
                onToggle={(id) => toggleBaseImage(id)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <FeaturesTab
                features={settings.features}
                onToggle={(id) => toggleFeature(id)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <TemplatesTab
                templates={settings.templates}
                onToggle={(id) => toggleTemplate(id)}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default DevcontainerAdmin;
