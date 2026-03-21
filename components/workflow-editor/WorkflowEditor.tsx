"use client";

import { useCallback, useState, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  reconnectEdge,
  MarkerType,
  ConnectionMode,
  type Connection,
  type Node,
  type Edge,
  type OnConnect,
  type OnReconnect,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nodeTypes } from "./WorkflowNode";
import { edgeTypes } from "./WorkflowEdge";
import { StepEditorPanel } from "./StepEditorPanel";
import {
  configToNodes,
  configToEdges,
  validateWorkflowConfig,
} from "@/lib/workflow-editor/utils";
import type {
  FlowspecWorkflowConfig,
  WorkflowStep,
  WorkflowTransition,
  WorkflowNodeData,
  WorkflowEdgeData,
} from "@/types/flowspec-workflow";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Save,
  Plus,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  FolderOpen,
  Users,
  FileCode,
  GitBranch,
  Edit,
  FilePlus,
  ChevronDown,
  Check,
  Eye,
  EyeOff,
  Filter,
} from "lucide-react";
import { toast } from "sonner";
import { MarkdownEditor } from "./MarkdownEditor";
import { FlowspecLoop } from "./FlowspecLoop";

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  stateCount: number;
  transitionCount: number;
}

type FlowNode = Node<WorkflowNodeData>;
type FlowEdge = Edge<WorkflowEdgeData>;

type EditorView = "workflow" | "loop" | "agents" | "prompts";

type ModelType = "claude" | "copilot";

interface AgentInfo {
  name: string;
  filename: string;
  path: string;
  identity: string;
  description: string;
  loop: "inner" | "outer";
  content: string;
  model: ModelType;
}

interface PromptInfo {
  name: string;
  filename: string;
  path: string;
  command: string;
  description: string;
  isInternal: boolean;
  content: string;
  model: ModelType;
  category: string;
}

interface ResourceStats {
  claude: number;
  copilot: number;
  total: number;
}

// Storage key for layout persistence
const LAYOUT_STORAGE_KEY = "workflow-editor-layout";
const ENABLED_AGENTS_KEY = "workflow-editor-enabled-agents";

interface SavedLayout {
  [projectPath: string]: {
    nodes: { [nodeId: string]: { x: number; y: number } };
    timestamp: number;
  };
}

interface WorkflowEditorProps {
  projectPath?: string;
  onClose?: () => void;
}

export function WorkflowEditor({ projectPath, onClose }: WorkflowEditorProps) {
  // View state
  const [activeView, setActiveView] = useState<EditorView>("workflow");

  // Workflow state
  const [config, setConfig] = useState<FlowspecWorkflowConfig | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentProject, setCurrentProject] = useState<string>(
    projectPath || "",
  );
  const [availableProjects, setAvailableProjects] = useState<string[]>([]);

  // Flowspec resources (agents/prompts)
  const [flowspecAgents, setFlowspecAgents] = useState<AgentInfo[]>([]);
  const [flowspecPrompts, setFlowspecPrompts] = useState<PromptInfo[]>([]);
  const [agentStats, setAgentStats] = useState<ResourceStats>({
    claude: 0,
    copilot: 0,
    total: 0,
  });
  const [promptStats, setPromptStats] = useState<ResourceStats>({
    claude: 0,
    copilot: 0,
    total: 0,
  });
  const [modelFilter, setModelFilter] = useState<ModelType | "all">("all");
  const [editingAgent, setEditingAgent] = useState<AgentInfo | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<PromptInfo | null>(null);

  // Enabled agents state (persisted to localStorage)
  const [enabledAgents, setEnabledAgents] = useState<string[]>([]);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);

  // Model filter for bottom panel (applies to both agents AND prompts)
  const [showClaudeAgents, setShowClaudeAgents] = useState(true);
  const [showCopilotAgents, setShowCopilotAgents] = useState(true);

  // Diagram view - hide optional pre-steps (assess, research) by default
  const [showOptionalSteps, setShowOptionalSteps] = useState(false);

  // Load enabled agents from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ENABLED_AGENTS_KEY);
      if (stored) {
        setEnabledAgents(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Failed to load enabled agents:", e);
    }
  }, []);

  // Toggle agent enabled state
  const toggleAgent = useCallback((agentName: string) => {
    setEnabledAgents((prev) => {
      const newEnabled = prev.includes(agentName)
        ? prev.filter((a) => a !== agentName)
        : [...prev, agentName];
      // Persist to localStorage
      try {
        localStorage.setItem(ENABLED_AGENTS_KEY, JSON.stringify(newEnabled));
      } catch (e) {
        console.warn("Failed to save enabled agents:", e);
      }
      return newEnabled;
    });
  }, []);

  // Filtered agents based on model checkboxes
  const filteredAgents = useMemo(() => {
    return flowspecAgents.filter((agent) => {
      if (agent.model === "claude" && !showClaudeAgents) return false;
      if (agent.model === "copilot" && !showCopilotAgents) return false;
      return true;
    });
  }, [flowspecAgents, showClaudeAgents, showCopilotAgents]);

  // Merged prompts - combine prompts with same command from different models
  interface MergedPrompt extends Omit<PromptInfo, "model"> {
    models: ModelType[];
  }

  const mergedPrompts = useMemo<MergedPrompt[]>(() => {
    const promptMap = new Map<string, MergedPrompt>();

    flowspecPrompts.forEach((prompt) => {
      // Filter by model checkboxes
      if (prompt.model === "claude" && !showClaudeAgents) return;
      if (prompt.model === "copilot" && !showCopilotAgents) return;

      const key = prompt.command; // Group by command
      const existing = promptMap.get(key);

      if (existing) {
        // Add model to existing entry if not already there
        if (!existing.models.includes(prompt.model)) {
          existing.models.push(prompt.model);
        }
      } else {
        // Create new entry
        promptMap.set(key, {
          name: prompt.name,
          filename: prompt.filename,
          path: prompt.path,
          command: prompt.command,
          description: prompt.description,
          isInternal: prompt.isInternal,
          content: prompt.content,
          category: prompt.category,
          models: [prompt.model],
        });
      }
    });

    return Array.from(promptMap.values()).sort((a, b) =>
      a.command.localeCompare(b.command),
    );
  }, [flowspecPrompts, showClaudeAgents, showCopilotAgents]);

  // Filter nodes/edges based on showOptionalSteps
  const filteredNodes = useMemo(() => {
    if (showOptionalSteps) return nodes;

    // Optional workflows to hide: assess, research
    const optionalWorkflows = ["assess", "research"];
    const optionalStates = ["To Do", "Assessed", "Researched"];

    return nodes.filter((node) => {
      // Hide optional workflow nodes
      if (node.data?.type === "workflow") {
        const workflowId = node.id.replace("workflow-", "");
        return !optionalWorkflows.includes(workflowId);
      }
      // Hide optional state nodes
      if (node.data?.type === "state") {
        return !optionalStates.includes(node.data.label || "");
      }
      return true;
    });
  }, [nodes, showOptionalSteps]);

  const filteredEdges = useMemo(() => {
    if (showOptionalSteps) return edges;

    // Get IDs of visible nodes
    const visibleNodeIds = new Set(filteredNodes.map((n) => n.id));

    // Only keep edges where both source and target are visible
    return edges.filter(
      (edge) =>
        visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target),
    );
  }, [edges, showOptionalSteps, filteredNodes]);

  // New workflow dialog state
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Save layout to localStorage
  const saveLayout = useCallback(
    (
      projectPath: string,
      nodePositions: { [id: string]: { x: number; y: number } },
    ) => {
      try {
        const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
        const layouts: SavedLayout = stored ? JSON.parse(stored) : {};
        layouts[projectPath] = {
          nodes: nodePositions,
          timestamp: Date.now(),
        };
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layouts));
      } catch (e) {
        console.warn("Failed to save layout:", e);
      }
    },
    [],
  );

  // Load layout from localStorage
  const loadLayout = useCallback(
    (
      projectPath: string,
    ): { [id: string]: { x: number; y: number } } | null => {
      try {
        const stored = localStorage.getItem(LAYOUT_STORAGE_KEY);
        if (!stored) return null;
        const layouts: SavedLayout = JSON.parse(stored);
        return layouts[projectPath]?.nodes || null;
      } catch (e) {
        console.warn("Failed to load layout:", e);
        return null;
      }
    },
    [],
  );

  // Handle node changes with layout persistence
  const handleNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      onNodesChange(changes);

      // Save layout when nodes are moved (not when just selected)
      const positionChanges = changes.filter(
        (c) => c.type === "position" && c.dragging === false && c.position,
      );

      if (positionChanges.length > 0 && currentProject) {
        // Debounce save by waiting for final positions
        const positions: { [id: string]: { x: number; y: number } } = {};
        nodes.forEach((node) => {
          positions[node.id] = { x: node.position.x, y: node.position.y };
        });
        saveLayout(currentProject, positions);
      }
    },
    [onNodesChange, currentProject, nodes, saveLayout],
  );

  // Get available states from config
  const availableStates = useMemo(() => {
    return config?.states || [];
  }, [config]);

  // Get selected step or transition data
  const selectedStep = useMemo(() => {
    if (!selectedNode || !config) return null;
    if (selectedNode.startsWith("workflow-")) {
      const workflowId = selectedNode.replace("workflow-", "");
      const workflow = config.workflows[workflowId];
      return workflow ? { ...workflow, id: workflowId } : null;
    }
    return null;
  }, [selectedNode, config]);

  const selectedTransition = useMemo(() => {
    if (!selectedEdge || !config) return null;
    // Extract transition from edge data
    const edge = edges.find((e) => e.id === selectedEdge);
    return edge?.data?.transition || null;
  }, [selectedEdge, config, edges]);

  // Load workflow config from API
  const loadConfig = useCallback(
    async (path: string) => {
      if (!path) return;

      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/workflow-editor/load?project=${encodeURIComponent(path)}`,
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "Failed to load workflow config");
        }

        const data = await response.json();
        setConfig(data.config);
        setCurrentProject(path);

        // Transform config to React Flow nodes/edges
        let flowNodes = configToNodes(data.config);
        const flowEdges = configToEdges(data.config);

        // Apply saved layout positions if available
        const savedPositions = loadLayout(path);
        if (savedPositions) {
          flowNodes = flowNodes.map((node) => {
            const savedPos = savedPositions[node.id];
            if (savedPos) {
              return { ...node, position: { x: savedPos.x, y: savedPos.y } };
            }
            return node;
          });
        }

        // Ensure edges have custom styling
        const styledEdges = flowEdges.map((edge) => ({
          ...edge,
          type: "workflowEdge",
          markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
        }));

        setNodes(flowNodes);
        setEdges(styledEdges);
        setIsDirty(false);

        toast.success("Workflow config loaded");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load config";
        setError(message);
        toast.error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [setNodes, setEdges],
  );

  // Save workflow config
  const saveConfig = useCallback(async () => {
    if (!config || !currentProject) return;

    setIsLoading(true);

    try {
      // Validate before saving
      const validation = validateWorkflowConfig(config);
      if (!validation.valid) {
        throw new Error(`Invalid config: ${validation.errors.join(", ")}`);
      }

      const response = await fetch("/api/workflow-editor/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: currentProject,
          config,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save workflow config");
      }

      setIsDirty(false);
      toast.success("Workflow config saved");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to save config";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [config, currentProject]);

  // Load available projects
  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch("/api/workflow-editor/projects");
        if (response.ok) {
          const data = await response.json();
          setAvailableProjects(data.projects || []);
        }
      } catch {
        // Silently fail - projects dropdown will just be empty
      }
    }
    fetchProjects();
  }, []);

  // Load flowspec agents and prompts
  useEffect(() => {
    async function fetchFlowspecResources() {
      try {
        const [agentsRes, promptsRes] = await Promise.all([
          fetch("/api/workflow-editor/agents"),
          fetch("/api/workflow-editor/prompts"),
        ]);

        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setFlowspecAgents(data.agents || []);
          if (data.stats) {
            setAgentStats(data.stats);
          }
        }

        if (promptsRes.ok) {
          const data = await promptsRes.json();
          setFlowspecPrompts(data.prompts || []);
          if (data.stats) {
            setPromptStats(data.stats);
          }
        }
      } catch (err) {
        console.error("Failed to fetch flowspec resources:", err);
      }
    }
    fetchFlowspecResources();
  }, []);

  // Save agent content
  const handleSaveAgent = useCallback(
    async (content: string) => {
      if (!editingAgent) return;
      const res = await fetch("/api/workflow-editor/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingAgent.name, content }),
      });
      if (res.ok) {
        const data = await res.json();
        setFlowspecAgents((prev) =>
          prev.map((a) => (a.name === editingAgent.name ? data.agent : a)),
        );
        setEditingAgent(data.agent);
        toast.success(`Agent "${editingAgent.name}" saved`);
      } else {
        toast.error("Failed to save agent");
        throw new Error("Failed to save agent");
      }
    },
    [editingAgent],
  );

  // Save prompt content
  const handleSavePrompt = useCallback(
    async (content: string) => {
      if (!editingPrompt) return;
      const res = await fetch("/api/workflow-editor/prompts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingPrompt.name, content }),
      });
      if (res.ok) {
        const data = await res.json();
        setFlowspecPrompts((prev) =>
          prev.map((p) => (p.name === editingPrompt.name ? data.prompt : p)),
        );
        setEditingPrompt(data.prompt);
        toast.success(`Prompt "${editingPrompt.name}" saved`);
      } else {
        toast.error("Failed to save prompt");
        throw new Error("Failed to save prompt");
      }
    },
    [editingPrompt],
  );

  // Fetch templates when dialog opens
  useEffect(() => {
    if (showNewDialog && templates.length === 0) {
      fetch("/api/workflow-editor/create")
        .then((res) => res.json())
        .then((data) => setTemplates(data.templates || []))
        .catch((err) => console.error("Failed to fetch templates:", err));
    }
  }, [showNewDialog, templates.length]);

  // Create new workflow
  const handleCreateWorkflow = useCallback(async () => {
    if (!currentProject || !selectedTemplate) {
      toast.error("Please select a project and template");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/workflow-editor/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectPath: currentProject,
          template: selectedTemplate,
          overwrite: false,
        }),
      });

      if (res.status === 409) {
        // File exists, ask to overwrite
        const confirm = window.confirm(
          "A workflow config already exists. Overwrite it?",
        );
        if (confirm) {
          const retryRes = await fetch("/api/workflow-editor/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectPath: currentProject,
              template: selectedTemplate,
              overwrite: true,
            }),
          });
          if (!retryRes.ok) {
            const errorData = await retryRes.json();
            throw new Error(errorData.error || "Failed to create workflow");
          }
        } else {
          return;
        }
      } else if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create workflow");
      }

      toast.success("Workflow created successfully");
      setShowNewDialog(false);
      setSelectedTemplate(null);

      // Reload the workflow list and load the new one
      const projRes = await fetch("/api/workflow-editor/projects");
      if (projRes.ok) {
        const data = await projRes.json();
        setAvailableProjects(data.projects || []);
      }
      loadConfig(currentProject);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create workflow";
      toast.error(message);
    } finally {
      setIsCreating(false);
    }
  }, [currentProject, selectedTemplate, loadConfig]);

  // Auto-load config if projectPath provided
  useEffect(() => {
    if (projectPath) {
      loadConfig(projectPath);
    }
  }, [projectPath, loadConfig]);

  // Handle node selection
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id);
    setSelectedEdge(null);
  }, []);

  // Handle edge selection
  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelectedEdge(edge.id);
    setSelectedNode(null);
  }, []);

  // Handle connection (new edge)
  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      // Add edge with custom styling and marker
      const newEdge = {
        ...connection,
        type: "workflowEdge",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
      };
      setEdges((eds) => addEdge(newEdge, eds) as FlowEdge[]);
      setIsDirty(true);
    },
    [setEdges],
  );

  // Handle edge reconnection (dragging edge endpoints)
  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      setEdges(
        (eds) => reconnectEdge(oldEdge, newConnection, eds) as FlowEdge[],
      );
      setIsDirty(true);
    },
    [setEdges],
  );

  // Handle step changes from panel
  const handleStepChange = useCallback(
    (step: WorkflowStep) => {
      if (!config) return;
      setConfig({
        ...config,
        workflows: {
          ...config.workflows,
          [step.id]: step,
        },
      });
      setIsDirty(true);
    },
    [config],
  );

  // Handle transition changes from panel
  const handleTransitionChange = useCallback(
    (transition: WorkflowTransition) => {
      if (!config) return;
      const transitionIndex = config.transitions.findIndex(
        (t) => t.name === transition.name,
      );
      if (transitionIndex === -1) return;

      const newTransitions = [...config.transitions];
      newTransitions[transitionIndex] = transition;
      setConfig({
        ...config,
        transitions: newTransitions,
      });
      setIsDirty(true);
    },
    [config],
  );

  // Close editor panel
  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  // Add new workflow step
  const handleAddStep = useCallback(() => {
    if (!config) return;

    const newId = `custom-${Date.now()}`;
    const newStep: WorkflowStep = {
      id: newId,
      command: `/flow:${newId}`,
      description: "New workflow step",
      agents: [],
      input_states: [],
      output_state: "",
      optional: true,
    };

    setConfig({
      ...config,
      workflows: {
        ...config.workflows,
        [newId]: newStep,
      },
    });

    // Add node to flow
    const newNode: Node<WorkflowNodeData> = {
      id: `workflow-${newId}`,
      type: "workflowNode",
      position: { x: 300, y: 200 },
      data: {
        label: newStep.command,
        type: "workflow",
        workflow: newStep,
      },
    };
    setNodes((nds) => [...nds, newNode]);
    setIsDirty(true);
    setSelectedNode(`workflow-${newId}`);

    toast.success("New step added");
  }, [config, setNodes]);

  // Delete selected step or transition
  const handleDelete = useCallback(() => {
    if (selectedNode && config) {
      if (selectedNode.startsWith("workflow-")) {
        const workflowId = selectedNode.replace("workflow-", "");
        const { [workflowId]: _, ...remainingWorkflows } = config.workflows;
        setConfig({
          ...config,
          workflows: remainingWorkflows,
          transitions: config.transitions.filter((t) => t.via !== workflowId),
        });
        setNodes((nds) => nds.filter((n) => n.id !== selectedNode));
        setEdges((eds) =>
          eds.filter(
            (e) =>
              !e.id.includes(workflowId) &&
              e.source !== selectedNode &&
              e.target !== selectedNode,
          ),
        );
        setSelectedNode(null);
        setIsDirty(true);
        toast.success("Step deleted");
      }
    } else if (selectedEdge && config) {
      const edge = edges.find((e) => e.id === selectedEdge);
      if (edge?.data?.transition) {
        setConfig({
          ...config,
          transitions: config.transitions.filter(
            (t) => t.name !== edge.data!.transition.name,
          ),
        });
        setEdges((eds) => eds.filter((e) => e.id !== selectedEdge));
        setSelectedEdge(null);
        setIsDirty(true);
        toast.success("Transition deleted");
      }
    }
  }, [selectedNode, selectedEdge, config, edges, setNodes, setEdges]);

  return (
    <div className="flex flex-col h-full">
      {/* Top navigation bar */}
      <div className="border-b bg-card px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Project selector */}
          <Select value={currentProject} onValueChange={loadConfig}>
            <SelectTrigger className="w-[220px]">
              <FolderOpen className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent>
              {availableProjects.map((project) => (
                <SelectItem key={project} value={project}>
                  {project.split("/").pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => currentProject && loadConfig(currentProject)}
            disabled={!currentProject || isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewDialog(true)}
          >
            <FilePlus className="h-4 w-4 mr-1" />
            New
          </Button>

          {/* View tabs */}
          <Tabs
            value={activeView}
            onValueChange={(v) => setActiveView(v as EditorView)}
          >
            <TabsList>
              <TabsTrigger value="workflow" className="gap-1.5">
                <GitBranch className="h-4 w-4" />
                Workflow
              </TabsTrigger>
              <TabsTrigger value="loop" className="gap-1.5">
                <RefreshCw className="h-4 w-4" />
                Loop
              </TabsTrigger>
              <TabsTrigger value="agents" className="gap-1.5">
                <Users className="h-4 w-4" />
                Agents ({agentStats.total})
              </TabsTrigger>
              <TabsTrigger value="prompts" className="gap-1.5">
                <FileCode className="h-4 w-4" />
                Prompts ({promptStats.total})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Status and actions */}
        <div className="flex items-center gap-2">
          {error && (
            <div className="flex items-center gap-1 text-destructive text-sm bg-destructive/10 px-2 py-1 rounded">
              <AlertTriangle className="h-4 w-4" />
              {error}
            </div>
          )}
          {isDirty && !error && (
            <div className="flex items-center gap-1 text-yellow-600 text-sm bg-yellow-500/10 px-2 py-1 rounded">
              <AlertTriangle className="h-4 w-4" />
              Unsaved
            </div>
          )}
          {!isDirty && config && !error && (
            <div className="flex items-center gap-1 text-green-600 text-sm bg-green-500/10 px-2 py-1 rounded">
              <CheckCircle className="h-4 w-4" />
              Saved
            </div>
          )}

          {/* Enabled Agents Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowAgentDropdown(!showAgentDropdown)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border transition-colors",
                enabledAgents.length > 0
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-muted border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="h-4 w-4" />
              <span>Agents ({enabledAgents.length})</span>
              <ChevronDown
                className={cn(
                  "h-3 w-3 transition-transform",
                  showAgentDropdown && "rotate-180",
                )}
              />
            </button>

            {showAgentDropdown && (
              <>
                {/* Backdrop to close dropdown */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowAgentDropdown(false)}
                />
                {/* Dropdown menu */}
                <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-popover border rounded-lg shadow-lg overflow-hidden">
                  <div className="px-3 py-2 border-b bg-muted/50">
                    <span className="text-xs font-medium text-muted-foreground">
                      Enabled Coding Agents
                    </span>
                  </div>
                  <ScrollArea className="max-h-64">
                    <div className="p-1">
                      {flowspecAgents.length === 0 && (
                        <div className="px-3 py-4 text-center text-sm text-muted-foreground">
                          No agents available
                        </div>
                      )}
                      {flowspecAgents.map((agent) => {
                        const isEnabled = enabledAgents.includes(agent.name);
                        return (
                          <button
                            key={agent.filename}
                            onClick={() => toggleAgent(agent.name)}
                            className={cn(
                              "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                              isEnabled
                                ? "bg-primary/10 text-foreground"
                                : "hover:bg-accent text-muted-foreground",
                            )}
                          >
                            <div
                              className={cn(
                                "w-4 h-4 rounded border flex items-center justify-center flex-shrink-0",
                                isEnabled
                                  ? "bg-primary border-primary text-primary-foreground"
                                  : "border-border",
                              )}
                            >
                              {isEnabled && <Check className="h-3 w-3" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate">{agent.name}</span>
                                <span
                                  className={cn(
                                    "text-[10px] px-1 rounded flex-shrink-0",
                                    agent.model === "claude"
                                      ? "bg-orange-500/20 text-orange-600"
                                      : "bg-blue-500/20 text-blue-600",
                                  )}
                                >
                                  {agent.model}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                  {enabledAgents.length > 0 && (
                    <div className="px-3 py-2 border-t bg-muted/50 flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">
                        {enabledAgents.length} selected
                      </span>
                      <button
                        onClick={() => {
                          setEnabledAgents([]);
                          localStorage.setItem(ENABLED_AGENTS_KEY, "[]");
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {activeView === "workflow" && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddStep}
                disabled={!config}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Step
              </Button>
              <Button
                variant={isDirty ? "default" : "outline"}
                size="sm"
                onClick={saveConfig}
                disabled={!config || isLoading || !isDirty}
              >
                <Save className="h-4 w-4 mr-1" />
                Save
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Workflow View - split layout: graph top, resources bottom */}
        {activeView === "workflow" && (
          <div className="flex flex-col h-full">
            {/* Top: Workflow Graph */}
            <div className="flex flex-[3] min-h-0 border-b">
              <div className="flex-1 relative">
                <ReactFlow
                  nodes={filteredNodes}
                  edges={filteredEdges}
                  onNodesChange={handleNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onReconnect={onReconnect}
                  onNodeClick={onNodeClick}
                  onEdgeClick={onEdgeClick}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  connectionMode={ConnectionMode.Loose}
                  edgesReconnectable
                  fitView
                  fitViewOptions={{ padding: 0.15, maxZoom: 1.5 }}
                  defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                  minZoom={0.3}
                  maxZoom={2}
                  proOptions={{ hideAttribution: true }}
                  className="bg-background"
                >
                  <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    className="opacity-30"
                  />
                  <Controls
                    showInteractive={false}
                    position="top-left"
                    className="!bg-card !border !shadow-md [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-accent"
                  />
                </ReactFlow>
              </div>

              {/* Editor panel - floating overlay when something selected */}
              {(selectedStep || selectedTransition) && (
                <StepEditorPanel
                  step={selectedStep}
                  transition={selectedTransition}
                  availableAgents={flowspecAgents.map((a) => ({
                    name: a.name,
                    identity: a.identity,
                    description: a.description,
                    responsibilities: [],
                  }))}
                  availableStates={availableStates}
                  onStepChange={handleStepChange}
                  onTransitionChange={handleTransitionChange}
                  onClose={handleClosePanel}
                  onDelete={handleDelete}
                  onEditPrompt={(stepId) => {
                    const prompt = flowspecPrompts.find(
                      (p) =>
                        p.name === stepId ||
                        p.command === `/flow:${stepId}` ||
                        p.filename.replace(".md", "") === stepId,
                    );
                    if (prompt) {
                      setEditingPrompt(prompt);
                    } else {
                      toast.error(
                        `No prompt found for step "${stepId}". Check Prompts tab.`,
                      );
                    }
                  }}
                />
              )}
            </div>

            {/* Bottom: Agents & Prompts Panel */}
            <div className="flex-1 min-h-[180px] max-h-[280px] bg-muted/30 overflow-hidden flex flex-col">
              {/* Model Filter Bar - applies to both agents and prompts */}
              <div className="px-3 py-2 border-b bg-card/80 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  {/* View toggle for diagram */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOptionalSteps(!showOptionalSteps)}
                    className="gap-1.5"
                  >
                    {showOptionalSteps ? (
                      <>
                        <Eye className="h-4 w-4" />
                        <span>All Steps</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="h-4 w-4" />
                        <span>Required Only</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Model Filters */}
                <div className="flex items-center gap-3">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showClaudeAgents}
                      onChange={(e) => setShowClaudeAgents(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Claude</span>
                    <span className="text-xs text-muted-foreground">
                      ({agentStats.claude}/{promptStats.claude})
                    </span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showCopilotAgents}
                      onChange={(e) => setShowCopilotAgents(e.target.checked)}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    <span className="text-sm">Copilot</span>
                    <span className="text-xs text-muted-foreground">
                      ({agentStats.copilot}/{promptStats.copilot})
                    </span>
                  </label>
                </div>
              </div>

              <div className="flex flex-1 min-h-0">
                {/* Agents Section */}
                <div className="flex-1 border-r overflow-hidden flex flex-col">
                  <div className="px-3 py-2 border-b bg-card flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Agents ({filteredAgents.length})
                      </span>
                    </div>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {filteredAgents.map((agent) => (
                        <div
                          key={agent.filename}
                          className="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer text-sm"
                          onClick={() => setEditingAgent(agent)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={cn(
                                "w-2 h-2 rounded-full flex-shrink-0",
                                agent.loop === "inner"
                                  ? "bg-green-500"
                                  : "bg-purple-500",
                              )}
                            />
                            <span className="truncate">{agent.name}</span>
                            <span
                              className={cn(
                                "text-[10px] px-1 rounded flex-shrink-0",
                                agent.model === "claude"
                                  ? "bg-orange-500/20 text-orange-600"
                                  : "bg-blue-500/20 text-blue-600",
                              )}
                            >
                              {agent.model}
                            </span>
                          </div>
                          <Edit className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </div>
                      ))}
                      {filteredAgents.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No agents found
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>

                {/* Prompts Section */}
                <div className="flex-1 overflow-hidden flex flex-col">
                  <div className="px-3 py-2 border-b bg-card flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileCode className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        Prompts ({mergedPrompts.length})
                      </span>
                    </div>
                  </div>
                  <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                      {mergedPrompts.map((prompt) => (
                        <div
                          key={prompt.command}
                          className="group flex items-center justify-between px-2 py-1.5 rounded hover:bg-accent/50 cursor-pointer text-sm"
                          onClick={() => {
                            // Find original prompt to edit (prefer claude if available)
                            const original = flowspecPrompts.find(
                              (p) =>
                                p.command === prompt.command &&
                                (prompt.models.includes("claude")
                                  ? p.model === "claude"
                                  : true),
                            );
                            if (original) setEditingPrompt(original);
                          }}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <code className="text-xs text-primary truncate">
                              {prompt.command}
                            </code>
                            <div className="flex gap-0.5 flex-shrink-0">
                              {prompt.models.map((model) => (
                                <span
                                  key={model}
                                  className={cn(
                                    "text-[10px] px-1 rounded",
                                    model === "claude"
                                      ? "bg-orange-500/20 text-orange-600"
                                      : "bg-blue-500/20 text-blue-600",
                                  )}
                                >
                                  {model}
                                </span>
                              ))}
                            </div>
                          </div>
                          <Edit className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                        </div>
                      ))}
                      {mergedPrompts.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">
                          No prompts found
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loop View - Flowspec Loop Diagram */}
        {activeView === "loop" && (
          <div className="flex-1 overflow-hidden">
            <FlowspecLoop />
          </div>
        )}

        {/* Agents View */}
        {activeView === "agents" && (
          <ScrollArea className="flex-1">
            <div className="max-w-4xl mx-auto p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Agent Definitions</h2>
                  <p className="text-sm text-muted-foreground">
                    Edit agent markdown files for Claude and Copilot
                  </p>
                </div>
                {/* Model filter tabs */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <button
                    onClick={() => setModelFilter("all")}
                    className={cn(
                      "px-3 py-1 text-sm rounded-md transition-colors",
                      modelFilter === "all"
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All ({agentStats.total})
                  </button>
                  <button
                    onClick={() => setModelFilter("claude")}
                    className={cn(
                      "px-3 py-1 text-sm rounded-md transition-colors",
                      modelFilter === "claude"
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Claude ({agentStats.claude})
                  </button>
                  <button
                    onClick={() => setModelFilter("copilot")}
                    className={cn(
                      "px-3 py-1 text-sm rounded-md transition-colors",
                      modelFilter === "copilot"
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Copilot ({agentStats.copilot})
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                {flowspecAgents
                  .filter(
                    (agent) =>
                      modelFilter === "all" || agent.model === modelFilter,
                  )
                  .map((agent) => (
                    <div
                      key={agent.filename}
                      className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{agent.name}</span>
                          <span
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded",
                              agent.model === "claude"
                                ? "bg-orange-500/20 text-orange-600"
                                : "bg-blue-500/20 text-blue-600",
                            )}
                          >
                            {agent.model}
                          </span>
                          <span
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded",
                              agent.loop === "inner"
                                ? "bg-green-500/20 text-green-600"
                                : "bg-purple-500/20 text-purple-600",
                            )}
                          >
                            {agent.loop} loop
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground truncate max-w-md">
                          {agent.description}
                        </p>
                        <code className="text-xs text-muted-foreground">
                          {agent.identity}
                        </code>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingAgent(agent)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  ))}

                {flowspecAgents.filter(
                  (agent) =>
                    modelFilter === "all" || agent.model === modelFilter,
                ).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No agents found
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}

        {/* Prompts View */}
        {activeView === "prompts" && (
          <ScrollArea className="flex-1">
            <div className="max-w-4xl mx-auto p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Prompt Templates</h2>
                  <p className="text-sm text-muted-foreground">
                    Edit slash command prompts for Claude and Copilot
                  </p>
                </div>
                {/* Model filter tabs */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <button
                    onClick={() => setModelFilter("all")}
                    className={cn(
                      "px-3 py-1 text-sm rounded-md transition-colors",
                      modelFilter === "all"
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    All ({promptStats.total})
                  </button>
                  <button
                    onClick={() => setModelFilter("claude")}
                    className={cn(
                      "px-3 py-1 text-sm rounded-md transition-colors",
                      modelFilter === "claude"
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Claude ({promptStats.claude})
                  </button>
                  <button
                    onClick={() => setModelFilter("copilot")}
                    className={cn(
                      "px-3 py-1 text-sm rounded-md transition-colors",
                      modelFilter === "copilot"
                        ? "bg-background shadow text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Copilot ({promptStats.copilot})
                  </button>
                </div>
              </div>

              <div className="grid gap-3">
                {flowspecPrompts
                  .filter(
                    (prompt) =>
                      modelFilter === "all" || prompt.model === modelFilter,
                  )
                  .map((prompt) => (
                    <div
                      key={prompt.filename}
                      className="flex items-center justify-between p-3 border rounded-lg bg-card hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <code className="font-medium text-primary">
                            {prompt.command}
                          </code>
                          <span
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded",
                              prompt.model === "claude"
                                ? "bg-orange-500/20 text-orange-600"
                                : "bg-blue-500/20 text-blue-600",
                            )}
                          >
                            {prompt.model}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {prompt.category}
                          </span>
                          {prompt.isInternal && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-600">
                              internal
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate max-w-md">
                          {prompt.description}
                        </p>
                        <code className="text-xs text-muted-foreground">
                          {prompt.filename}
                        </code>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditingPrompt(prompt)}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  ))}

                {flowspecPrompts.filter(
                  (prompt) =>
                    modelFilter === "all" || prompt.model === modelFilter,
                ).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No prompts found
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Markdown editors (modals) */}
      {editingAgent && (
        <MarkdownEditor
          title={`Edit Agent: ${editingAgent.name}`}
          content={editingAgent.content}
          onSave={handleSaveAgent}
          onClose={() => setEditingAgent(null)}
        />
      )}

      {editingPrompt && (
        <MarkdownEditor
          title={`Edit Prompt: ${editingPrompt.command}`}
          content={editingPrompt.content}
          onSave={handleSavePrompt}
          onClose={() => setEditingPrompt(null)}
        />
      )}

      {/* New Workflow Dialog */}
      <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Workflow</DialogTitle>
            <DialogDescription>
              Create a new flowspec_workflow.yml in the current project.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Current project (read-only) */}
            {currentProject && (
              <div className="space-y-2">
                <Label>Project</Label>
                <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-md text-sm">
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="truncate">
                    {currentProject.split("/").pop() || currentProject}
                  </span>
                </div>
              </div>
            )}

            {!currentProject && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
                Please select a project first using the project dropdown.
              </div>
            )}

            {/* Template selection */}
            <div className="space-y-2">
              <Label>Select Template</Label>
              <div className="grid gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplate(template.id)}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                      selectedTemplate === template.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-accent/50",
                    )}
                  >
                    <div className="flex-1">
                      <div className="font-medium">{template.name}</div>
                      <p className="text-sm text-muted-foreground">
                        {template.description}
                      </p>
                      <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                        <span>{template.stateCount} states</span>
                        <span>•</span>
                        <span>{template.transitionCount} transitions</span>
                      </div>
                    </div>
                    {selectedTemplate === template.id && (
                      <CheckCircle className="h-5 w-5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowNewDialog(false);
                setSelectedTemplate(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkflow}
              disabled={!currentProject || !selectedTemplate || isCreating}
            >
              {isCreating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <FilePlus className="h-4 w-4 mr-1" />
                  Create Workflow
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
