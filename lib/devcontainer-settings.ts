/**
 * DevContainer Settings
 *
 * Configuration for devcontainer template sources, base images, and features.
 * Allows customizing which GitHub repos to pull from and which items to enable.
 *
 * Data sourced from:
 * - Features: https://github.com/devcontainers/features/tree/main/src
 * - Images: https://github.com/devcontainers/images/tree/main/src
 * - Templates: https://github.com/devcontainers/templates/tree/main/src
 */

const DEVCONTAINER_SETTINGS_KEY = "daax-devcontainer-settings";

// Default GitHub organizations for devcontainers
export const DEFAULT_REPOS = {
  templates: "devcontainers/templates",
  images: "devcontainers/images",
  features: "devcontainers/features",
};

// Base image definition
export interface DevcontainerBaseImage {
  id: string;
  name: string;
  icon: string;
  image: string;
  enabled: boolean;
}

// Feature definition
export interface DevcontainerFeature {
  id: string;
  name: string;
  feature: string;
  description: string;
  enabled: boolean;
}

// Template definition
export interface DevcontainerTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  enabled: boolean;
}

// Full settings structure
export interface DevcontainerSettings {
  // GitHub repository sources (owner/repo format)
  repos: {
    templates: string;
    images: string;
    features: string;
  };
  // Custom base images with enable/disable
  baseImages: DevcontainerBaseImage[];
  // Custom features with enable/disable
  features: DevcontainerFeature[];
  // Custom templates with enable/disable
  templates: DevcontainerTemplate[];
}

// Default base images (from https://github.com/devcontainers/images/tree/main/src)
export const DEFAULT_BASE_IMAGES: DevcontainerBaseImage[] = [
  // Node.js
  {
    id: "node-22",
    name: "Node.js 22",
    icon: "/icons/languages/nodejs.svg",
    image: "mcr.microsoft.com/devcontainers/javascript-node:22",
    enabled: true,
  },
  {
    id: "node-20",
    name: "Node.js 20",
    icon: "/icons/languages/nodejs.svg",
    image: "mcr.microsoft.com/devcontainers/javascript-node:20",
    enabled: true,
  },
  {
    id: "node-18",
    name: "Node.js 18",
    icon: "/icons/languages/nodejs.svg",
    image: "mcr.microsoft.com/devcontainers/javascript-node:18",
    enabled: false,
  },
  // TypeScript
  {
    id: "typescript-node-22",
    name: "TypeScript Node 22",
    icon: "/icons/languages/typescript.svg",
    image: "mcr.microsoft.com/devcontainers/typescript-node:22",
    enabled: true,
  },
  {
    id: "typescript-node-20",
    name: "TypeScript Node 20",
    icon: "/icons/languages/typescript.svg",
    image: "mcr.microsoft.com/devcontainers/typescript-node:20",
    enabled: false,
  },
  // Python
  {
    id: "python-3.12",
    name: "Python 3.12",
    icon: "/icons/languages/python.svg",
    image: "mcr.microsoft.com/devcontainers/python:3.12",
    enabled: true,
  },
  {
    id: "python-3.11",
    name: "Python 3.11",
    icon: "/icons/languages/python.svg",
    image: "mcr.microsoft.com/devcontainers/python:3.11",
    enabled: true,
  },
  {
    id: "python-3.10",
    name: "Python 3.10",
    icon: "/icons/languages/python.svg",
    image: "mcr.microsoft.com/devcontainers/python:3.10",
    enabled: false,
  },
  {
    id: "anaconda",
    name: "Anaconda",
    icon: "/icons/languages/python.svg",
    image: "mcr.microsoft.com/devcontainers/anaconda:3",
    enabled: false,
  },
  {
    id: "miniconda",
    name: "Miniconda",
    icon: "/icons/languages/python.svg",
    image: "mcr.microsoft.com/devcontainers/miniconda:3",
    enabled: false,
  },
  // Go
  {
    id: "go-1.22",
    name: "Go 1.22",
    icon: "/icons/languages/go.svg",
    image: "mcr.microsoft.com/devcontainers/go:1.22",
    enabled: true,
  },
  {
    id: "go-1.21",
    name: "Go 1.21",
    icon: "/icons/languages/go.svg",
    image: "mcr.microsoft.com/devcontainers/go:1.21",
    enabled: true,
  },
  {
    id: "go-1.20",
    name: "Go 1.20",
    icon: "/icons/languages/go.svg",
    image: "mcr.microsoft.com/devcontainers/go:1.20",
    enabled: false,
  },
  // Rust
  {
    id: "rust-1",
    name: "Rust",
    icon: "/icons/languages/rust.svg",
    image: "mcr.microsoft.com/devcontainers/rust:1",
    enabled: true,
  },
  // Java
  {
    id: "java-21",
    name: "Java 21",
    icon: "/icons/languages/java.svg",
    image: "mcr.microsoft.com/devcontainers/java:21",
    enabled: true,
  },
  {
    id: "java-17",
    name: "Java 17",
    icon: "/icons/languages/java.svg",
    image: "mcr.microsoft.com/devcontainers/java:17",
    enabled: true,
  },
  {
    id: "java-11",
    name: "Java 11",
    icon: "/icons/languages/java.svg",
    image: "mcr.microsoft.com/devcontainers/java:11",
    enabled: false,
  },
  {
    id: "java-8",
    name: "Java 8",
    icon: "/icons/languages/java.svg",
    image: "mcr.microsoft.com/devcontainers/java:8",
    enabled: false,
  },
  // .NET
  {
    id: "dotnet-8",
    name: ".NET 8",
    icon: "/icons/languages/dotnet.svg",
    image: "mcr.microsoft.com/devcontainers/dotnet:8.0",
    enabled: true,
  },
  {
    id: "dotnet-7",
    name: ".NET 7",
    icon: "/icons/languages/dotnet.svg",
    image: "mcr.microsoft.com/devcontainers/dotnet:7.0",
    enabled: false,
  },
  {
    id: "dotnet-6",
    name: ".NET 6",
    icon: "/icons/languages/dotnet.svg",
    image: "mcr.microsoft.com/devcontainers/dotnet:6.0",
    enabled: false,
  },
  // C++
  {
    id: "cpp",
    name: "C++",
    icon: "/icons/languages/cpp.svg",
    image: "mcr.microsoft.com/devcontainers/cpp:1",
    enabled: true,
  },
  // PHP
  {
    id: "php-8.3",
    name: "PHP 8.3",
    icon: "/icons/languages/php.svg",
    image: "mcr.microsoft.com/devcontainers/php:8.3",
    enabled: true,
  },
  {
    id: "php-8.2",
    name: "PHP 8.2",
    icon: "/icons/languages/php.svg",
    image: "mcr.microsoft.com/devcontainers/php:8.2",
    enabled: false,
  },
  {
    id: "php-8.1",
    name: "PHP 8.1",
    icon: "/icons/languages/php.svg",
    image: "mcr.microsoft.com/devcontainers/php:8.1",
    enabled: false,
  },
  // Ruby
  {
    id: "ruby-3.3",
    name: "Ruby 3.3",
    icon: "/icons/languages/ruby.svg",
    image: "mcr.microsoft.com/devcontainers/ruby:3.3",
    enabled: true,
  },
  {
    id: "ruby-3.2",
    name: "Ruby 3.2",
    icon: "/icons/languages/ruby.svg",
    image: "mcr.microsoft.com/devcontainers/ruby:3.2",
    enabled: false,
  },
  {
    id: "ruby-3.1",
    name: "Ruby 3.1",
    icon: "/icons/languages/ruby.svg",
    image: "mcr.microsoft.com/devcontainers/ruby:3.1",
    enabled: false,
  },
  {
    id: "jekyll",
    name: "Jekyll",
    icon: "/icons/languages/ruby.svg",
    image: "mcr.microsoft.com/devcontainers/jekyll:2",
    enabled: false,
  },
  // Base images
  {
    id: "base-ubuntu",
    name: "Ubuntu",
    icon: "/icons/languages/docker.svg",
    image: "mcr.microsoft.com/devcontainers/base:ubuntu",
    enabled: true,
  },
  {
    id: "base-debian",
    name: "Debian",
    icon: "/icons/languages/docker.svg",
    image: "mcr.microsoft.com/devcontainers/base:debian",
    enabled: true,
  },
  {
    id: "base-alpine",
    name: "Alpine",
    icon: "/icons/languages/docker.svg",
    image: "mcr.microsoft.com/devcontainers/base:alpine",
    enabled: false,
  },
  // Universal
  {
    id: "universal",
    name: "Universal",
    icon: "/icons/languages/docker.svg",
    image: "mcr.microsoft.com/devcontainers/universal:2",
    enabled: true,
  },
];

// Default features (from https://github.com/devcontainers/features/tree/main/src)
export const DEFAULT_FEATURES: DevcontainerFeature[] = [
  // Core tools
  {
    id: "git",
    name: "Git",
    feature: "ghcr.io/devcontainers/features/git:1",
    description: "Git version control system",
    enabled: true,
  },
  {
    id: "git-lfs",
    name: "Git LFS",
    feature: "ghcr.io/devcontainers/features/git-lfs:1",
    description: "Git Large File Storage",
    enabled: false,
  },
  {
    id: "github-cli",
    name: "GitHub CLI",
    feature: "ghcr.io/devcontainers/features/github-cli:1",
    description: "GitHub command-line tool (gh)",
    enabled: true,
  },
  {
    id: "common-utils",
    name: "Common Utilities",
    feature: "ghcr.io/devcontainers/features/common-utils:2",
    description: "Common dev utilities (zsh, oh-my-zsh, etc.)",
    enabled: true,
  },

  // Docker
  {
    id: "docker-in-docker",
    name: "Docker-in-Docker",
    feature: "ghcr.io/devcontainers/features/docker-in-docker:2",
    description: "Run Docker daemon inside container",
    enabled: true,
  },
  {
    id: "docker-outside-of-docker",
    name: "Docker-outside-of-Docker",
    feature: "ghcr.io/devcontainers/features/docker-outside-of-docker:1",
    description: "Use host Docker socket",
    enabled: true,
  },

  // Cloud CLIs
  {
    id: "aws-cli",
    name: "AWS CLI",
    feature: "ghcr.io/devcontainers/features/aws-cli:1",
    description: "Amazon Web Services CLI v2",
    enabled: true,
  },
  {
    id: "azure-cli",
    name: "Azure CLI",
    feature: "ghcr.io/devcontainers/features/azure-cli:1",
    description: "Microsoft Azure CLI",
    enabled: true,
  },
  {
    id: "copilot-cli",
    name: "AWS Copilot CLI",
    feature: "ghcr.io/devcontainers/features/copilot-cli:1",
    description: "AWS Copilot CLI for containers",
    enabled: false,
  },

  // Kubernetes & Infrastructure
  {
    id: "kubectl-helm-minikube",
    name: "Kubernetes Tools",
    feature: "ghcr.io/devcontainers/features/kubectl-helm-minikube:1",
    description: "kubectl, Helm, and minikube",
    enabled: true,
  },
  {
    id: "terraform",
    name: "Terraform",
    feature: "ghcr.io/devcontainers/features/terraform:1",
    description: "HashiCorp Terraform",
    enabled: true,
  },

  // Languages & Runtimes
  {
    id: "node",
    name: "Node.js",
    feature: "ghcr.io/devcontainers/features/node:1",
    description: "Node.js runtime and npm",
    enabled: false,
  },
  {
    id: "python",
    name: "Python",
    feature: "ghcr.io/devcontainers/features/python:1",
    description: "Python runtime and pip",
    enabled: false,
  },
  {
    id: "go",
    name: "Go",
    feature: "ghcr.io/devcontainers/features/go:1",
    description: "Go programming language",
    enabled: false,
  },
  {
    id: "rust",
    name: "Rust",
    feature: "ghcr.io/devcontainers/features/rust:1",
    description: "Rust programming language",
    enabled: false,
  },
  {
    id: "java",
    name: "Java",
    feature: "ghcr.io/devcontainers/features/java:1",
    description: "Java JDK (Eclipse Temurin)",
    enabled: false,
  },
  {
    id: "dotnet",
    name: ".NET",
    feature: "ghcr.io/devcontainers/features/dotnet:2",
    description: ".NET SDK and runtime",
    enabled: false,
  },
  {
    id: "php",
    name: "PHP",
    feature: "ghcr.io/devcontainers/features/php:1",
    description: "PHP runtime and Composer",
    enabled: false,
  },
  {
    id: "ruby",
    name: "Ruby",
    feature: "ghcr.io/devcontainers/features/ruby:1",
    description: "Ruby runtime and gems",
    enabled: false,
  },
  {
    id: "hugo",
    name: "Hugo",
    feature: "ghcr.io/devcontainers/features/hugo:1",
    description: "Hugo static site generator",
    enabled: false,
  },

  // Python Tools
  {
    id: "anaconda",
    name: "Anaconda",
    feature: "ghcr.io/devcontainers/features/anaconda:1",
    description: "Anaconda distribution",
    enabled: false,
  },
  {
    id: "conda",
    name: "Conda",
    feature: "ghcr.io/devcontainers/features/conda:1",
    description: "Conda package manager",
    enabled: false,
  },

  // Shell & Utilities
  {
    id: "powershell",
    name: "PowerShell",
    feature: "ghcr.io/devcontainers/features/powershell:1",
    description: "PowerShell Core",
    enabled: false,
  },
  {
    id: "sshd",
    name: "SSH Server",
    feature: "ghcr.io/devcontainers/features/sshd:1",
    description: "OpenSSH server",
    enabled: false,
  },
  {
    id: "nix",
    name: "Nix",
    feature: "ghcr.io/devcontainers/features/nix:1",
    description: "Nix package manager",
    enabled: false,
  },

  // Desktop & GPU
  {
    id: "desktop-lite",
    name: "Desktop (Lite)",
    feature: "ghcr.io/devcontainers/features/desktop-lite:1",
    description: "Lightweight desktop environment",
    enabled: false,
  },
  {
    id: "nvidia-cuda",
    name: "NVIDIA CUDA",
    feature: "ghcr.io/devcontainers/features/nvidia-cuda:1",
    description: "NVIDIA CUDA toolkit",
    enabled: false,
  },

  // Build tools
  {
    id: "oryx",
    name: "Oryx",
    feature: "ghcr.io/devcontainers/features/oryx:1",
    description: "Microsoft Oryx build system",
    enabled: false,
  },
];

// Default templates (from https://github.com/devcontainers/templates/tree/main/src)
export const DEFAULT_TEMPLATES: DevcontainerTemplate[] = [
  {
    id: "javascript-node",
    name: "Node.js & JavaScript",
    description: "Node.js development environment",
    icon: "/icons/languages/nodejs.svg",
    enabled: true,
  },
  {
    id: "typescript-node",
    name: "Node.js & TypeScript",
    description: "TypeScript with Node.js",
    icon: "/icons/languages/typescript.svg",
    enabled: true,
  },
  {
    id: "python",
    name: "Python",
    description: "Python development environment",
    icon: "/icons/languages/python.svg",
    enabled: true,
  },
  {
    id: "anaconda",
    name: "Anaconda (Python)",
    description: "Anaconda Python distribution",
    icon: "/icons/languages/python.svg",
    enabled: false,
  },
  {
    id: "miniconda",
    name: "Miniconda (Python)",
    description: "Miniconda Python distribution",
    icon: "/icons/languages/python.svg",
    enabled: false,
  },
  {
    id: "go",
    name: "Go",
    description: "Go development environment",
    icon: "/icons/languages/go.svg",
    enabled: true,
  },
  {
    id: "rust",
    name: "Rust",
    description: "Rust development environment",
    icon: "/icons/languages/rust.svg",
    enabled: true,
  },
  {
    id: "java",
    name: "Java",
    description: "Java development environment",
    icon: "/icons/languages/java.svg",
    enabled: true,
  },
  {
    id: "java-8",
    name: "Java 8",
    description: "Java 8 development environment",
    icon: "/icons/languages/java.svg",
    enabled: false,
  },
  {
    id: "dotnet",
    name: ".NET",
    description: ".NET development environment",
    icon: "/icons/languages/dotnet.svg",
    enabled: true,
  },
  {
    id: "cpp",
    name: "C++",
    description: "C++ development environment",
    icon: "/icons/languages/cpp.svg",
    enabled: true,
  },
  {
    id: "php",
    name: "PHP",
    description: "PHP development environment",
    icon: "/icons/languages/php.svg",
    enabled: true,
  },
  {
    id: "ruby",
    name: "Ruby",
    description: "Ruby development environment",
    icon: "/icons/languages/ruby.svg",
    enabled: true,
  },
  {
    id: "jekyll",
    name: "Jekyll",
    description: "Jekyll static site generator",
    icon: "/icons/languages/ruby.svg",
    enabled: false,
  },
  {
    id: "ubuntu",
    name: "Ubuntu",
    description: "Ubuntu base environment",
    icon: "/icons/languages/docker.svg",
    enabled: true,
  },
  {
    id: "debian",
    name: "Debian",
    description: "Debian base environment",
    icon: "/icons/languages/docker.svg",
    enabled: true,
  },
  {
    id: "alpine",
    name: "Alpine",
    description: "Alpine Linux base environment",
    icon: "/icons/languages/docker.svg",
    enabled: false,
  },
  {
    id: "universal",
    name: "Universal",
    description: "Multi-language development environment",
    icon: "/icons/languages/docker.svg",
    enabled: true,
  },
];

const DEFAULT_SETTINGS: DevcontainerSettings = {
  repos: DEFAULT_REPOS,
  baseImages: DEFAULT_BASE_IMAGES,
  features: DEFAULT_FEATURES,
  templates: DEFAULT_TEMPLATES,
};

// Get settings from localStorage
export function getDevcontainerSettings(): DevcontainerSettings {
  if (typeof window === "undefined") {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(DEVCONTAINER_SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new fields
      return {
        repos: { ...DEFAULT_REPOS, ...parsed.repos },
        baseImages: mergeItems(DEFAULT_BASE_IMAGES, parsed.baseImages || []),
        features: mergeItems(DEFAULT_FEATURES, parsed.features || []),
        templates: mergeItems(DEFAULT_TEMPLATES, parsed.templates || []),
      };
    }
  } catch (error) {
    console.error("[DevcontainerSettings] Error loading settings:", error);
  }

  return DEFAULT_SETTINGS;
}

// Merge default items with stored items (preserving enabled state)
function mergeItems<T extends { id: string; enabled: boolean }>(
  defaults: T[],
  stored: T[],
): T[] {
  const storedMap = new Map(stored.map((item) => [item.id, item]));
  return defaults.map((defaultItem) => {
    const storedItem = storedMap.get(defaultItem.id);
    if (storedItem) {
      return { ...defaultItem, enabled: storedItem.enabled };
    }
    return defaultItem;
  });
}

// Save settings to localStorage
export function saveDevcontainerSettings(
  settings: Partial<DevcontainerSettings>,
): DevcontainerSettings {
  const current = getDevcontainerSettings();
  const updated = {
    ...current,
    ...settings,
    repos: settings.repos
      ? { ...current.repos, ...settings.repos }
      : current.repos,
  };

  if (typeof window !== "undefined") {
    localStorage.setItem(DEVCONTAINER_SETTINGS_KEY, JSON.stringify(updated));
    notifySubscribers(updated);
  }

  return updated;
}

// Toggle item enabled state
export function toggleBaseImage(id: string): DevcontainerSettings {
  const settings = getDevcontainerSettings();
  const baseImages = settings.baseImages.map((img) =>
    img.id === id ? { ...img, enabled: !img.enabled } : img,
  );
  return saveDevcontainerSettings({ baseImages });
}

export function toggleFeature(id: string): DevcontainerSettings {
  const settings = getDevcontainerSettings();
  const features = settings.features.map((f) =>
    f.id === id ? { ...f, enabled: !f.enabled } : f,
  );
  return saveDevcontainerSettings({ features });
}

export function toggleTemplate(id: string): DevcontainerSettings {
  const settings = getDevcontainerSettings();
  const templates = settings.templates.map((t) =>
    t.id === id ? { ...t, enabled: !t.enabled } : t,
  );
  return saveDevcontainerSettings({ templates });
}

// Get only enabled items
export function getEnabledBaseImages(): DevcontainerBaseImage[] {
  return getDevcontainerSettings().baseImages.filter((img) => img.enabled);
}

export function getEnabledFeatures(): DevcontainerFeature[] {
  return getDevcontainerSettings().features.filter((f) => f.enabled);
}

export function getEnabledTemplates(): DevcontainerTemplate[] {
  return getDevcontainerSettings().templates.filter((t) => t.enabled);
}

// Subscribe to settings changes
type SettingsListener = (settings: DevcontainerSettings) => void;
const listeners = new Set<SettingsListener>();

export function subscribeToDevcontainerSettings(
  listener: SettingsListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifySubscribers(settings: DevcontainerSettings) {
  listeners.forEach((listener) => listener(settings));
}

// Reset to defaults
export function resetDevcontainerSettings(): DevcontainerSettings {
  if (typeof window !== "undefined") {
    localStorage.removeItem(DEVCONTAINER_SETTINGS_KEY);
    notifySubscribers(DEFAULT_SETTINGS);
  }
  return DEFAULT_SETTINGS;
}
