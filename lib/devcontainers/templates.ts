/**
 * DevContainer Quickstart Templates
 *
 * Pre-configured templates using official Microsoft Container Registry images.
 * These follow the containers.dev specification.
 */

export interface QuickstartTemplate {
  id: string;
  name: string;
  description: string;
  image: string;
  icon: string;
  tags: string[];
  // Default features to include (ghcr.io/devcontainers/features/...)
  defaultFeatures: Record<string, Record<string, unknown>>;
  // VS Code extensions
  extensions: string[];
  // VS Code settings
  settings?: Record<string, unknown>;
  // Post-create command
  postCreateCommand?: string;
  // Ports to forward
  forwardPorts?: number[];
}

export const QUICKSTART_TEMPLATES: QuickstartTemplate[] = [
  {
    id: "node",
    name: "Node.js",
    description: "JavaScript/TypeScript development with Node.js",
    image: "mcr.microsoft.com/devcontainers/javascript-node:22",
    icon: "/icons/languages/nodejs.svg",
    tags: ["node", "javascript", "typescript"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
    },
    extensions: ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"],
    settings: {
      "editor.formatOnSave": true,
      "editor.defaultFormatter": "esbenp.prettier-vscode",
    },
  },
  {
    id: "python",
    name: "Python",
    description: "Python development with pip and common tools",
    image: "mcr.microsoft.com/devcontainers/python:3.12",
    icon: "/icons/languages/python.svg",
    tags: ["python", "pip", "venv"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
    },
    extensions: ["ms-python.python", "ms-python.vscode-pylance"],
    settings: {
      "python.defaultInterpreterPath": "/usr/local/bin/python",
    },
  },
  {
    id: "go",
    name: "Go",
    description: "Go development with standard tooling",
    image: "mcr.microsoft.com/devcontainers/go:1.22",
    icon: "/icons/languages/go.svg",
    tags: ["go", "golang"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
    },
    extensions: ["golang.go"],
    settings: {
      "go.toolsManagement.autoUpdate": true,
    },
  },
  {
    id: "rust",
    name: "Rust",
    description: "Rust development with cargo and common tools",
    image: "mcr.microsoft.com/devcontainers/rust:1",
    icon: "/icons/languages/rust.svg",
    tags: ["rust", "cargo"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
    },
    extensions: ["rust-lang.rust-analyzer"],
  },
  {
    id: "java",
    name: "Java",
    description: "Java development with JDK and Maven/Gradle",
    image: "mcr.microsoft.com/devcontainers/java:21",
    icon: "/icons/languages/java.svg",
    tags: ["java", "maven", "gradle"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
      "ghcr.io/devcontainers/features/java:1": {
        version: "21",
        installMaven: true,
        installGradle: true,
      },
    },
    extensions: ["vscjava.vscode-java-pack"],
  },
  {
    id: "dotnet",
    name: ".NET",
    description: "C# and .NET development",
    image: "mcr.microsoft.com/devcontainers/dotnet:8.0",
    icon: "/icons/languages/dotnet.svg",
    tags: ["dotnet", "csharp", "fsharp"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
    },
    extensions: ["ms-dotnettools.csharp", "ms-dotnettools.csdevkit"],
  },
  {
    id: "typescript",
    name: "TypeScript",
    description: "TypeScript development with Node.js",
    image: "mcr.microsoft.com/devcontainers/typescript-node:22",
    icon: "/icons/languages/typescript.svg",
    tags: ["typescript", "node", "javascript"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
    },
    extensions: ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode"],
    settings: {
      "editor.formatOnSave": true,
      "typescript.preferences.importModuleSpecifier": "relative",
    },
  },
  {
    id: "cpp",
    name: "C++",
    description: "C++ development with GCC/Clang",
    image: "mcr.microsoft.com/devcontainers/cpp:1",
    icon: "/icons/languages/cpp.svg",
    tags: ["cpp", "c++", "cmake"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
    },
    extensions: ["ms-vscode.cpptools", "ms-vscode.cmake-tools"],
  },
  {
    id: "php",
    name: "PHP",
    description: "PHP development with Composer",
    image: "mcr.microsoft.com/devcontainers/php:8.3",
    icon: "/icons/languages/php.svg",
    tags: ["php", "composer"],
    defaultFeatures: {
      "ghcr.io/devcontainers/features/git:1": {},
    },
    extensions: ["bmewburn.vscode-intelephense-client"],
  },
];

/**
 * Available devcontainer features from the official registry
 */
export interface DevContainerFeature {
  id: string;
  name: string;
  description: string;
  registry: string;
  repository: string;
  options?: Record<
    string,
    {
      type: "string" | "boolean";
      description: string;
      default?: string | boolean;
      enum?: string[];
    }
  >;
}

export const COMMON_FEATURES: DevContainerFeature[] = [
  {
    id: "git",
    name: "Git",
    description: "Install Git",
    registry: "ghcr.io",
    repository: "devcontainers/features/git",
  },
  {
    id: "docker-in-docker",
    name: "Docker in Docker",
    description: "Install Docker CLI and daemon inside the container",
    registry: "ghcr.io",
    repository: "devcontainers/features/docker-in-docker",
    options: {
      version: {
        type: "string",
        description: "Docker version",
        default: "latest",
      },
      moby: { type: "boolean", description: "Use Moby engine", default: true },
    },
  },
  {
    id: "docker-outside-of-docker",
    name: "Docker Outside of Docker",
    description: "Re-use host Docker socket inside the container",
    registry: "ghcr.io",
    repository: "devcontainers/features/docker-outside-of-docker",
  },
  {
    id: "kubectl-helm-minikube",
    name: "Kubernetes Tools",
    description: "Install kubectl, Helm, and minikube",
    registry: "ghcr.io",
    repository: "devcontainers/features/kubectl-helm-minikube",
  },
  {
    id: "aws-cli",
    name: "AWS CLI",
    description: "Install AWS CLI v2",
    registry: "ghcr.io",
    repository: "devcontainers/features/aws-cli",
  },
  {
    id: "azure-cli",
    name: "Azure CLI",
    description: "Install Azure CLI",
    registry: "ghcr.io",
    repository: "devcontainers/features/azure-cli",
  },
  {
    id: "gcloud",
    name: "Google Cloud CLI",
    description: "Install gcloud CLI",
    registry: "ghcr.io",
    repository: "devcontainers/features/gcloud",
  },
  {
    id: "terraform",
    name: "Terraform",
    description: "Install HashiCorp Terraform",
    registry: "ghcr.io",
    repository: "devcontainers/features/terraform",
  },
  {
    id: "github-cli",
    name: "GitHub CLI",
    description: "Install GitHub CLI (gh)",
    registry: "ghcr.io",
    repository: "devcontainers/features/github-cli",
  },
  {
    id: "common-utils",
    name: "Common Utilities",
    description: "Install common developer utilities (zsh, oh-my-zsh, etc.)",
    registry: "ghcr.io",
    repository: "devcontainers/features/common-utils",
  },
];
