import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { api, push } = vi.hoisted(() => ({
  api: {
    config: vi.fn(),
    validateEgress: vi.fn(),
    create: vi.fn(),
  },
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/substrate/client", async (orig) => ({
  ...(await orig<typeof import("@/lib/substrate/client")>()),
  substrateApi: api,
}));

import { AgentLaunchDialog } from "@/components/ai-coding/substrate/AgentLaunchDialog";
import { _resetSubstrateConfigCache } from "@/components/ai-coding/substrate/use-substrate-config";
import { SubstrateApiError } from "@/lib/substrate/client";

const CONFIG = {
  enabled: true,
  atespace: "kinsale",
  transport: "proxy",
  agents: ["claude", "codex", "gemini", "opencode", "copilot"],
  sandboxClasses: ["gvisor", "microvm"],
  defaultClass: "gvisor",
  templates: {
    claude: {
      gvisor: "daax-claude-gvisor-abc",
      microvm: "daax-claude-microvm-abc",
    },
    codex: { gvisor: null, microvm: null },
    gemini: { gvisor: null, microvm: null },
    opencode: { gvisor: null, microvm: null },
    copilot: { gvisor: null, microvm: null },
  },
  egressPresets: {
    npm: ["registry.npmjs.org"],
    pypi: ["pypi.org", "files.pythonhosted.org"],
    github: ["github.com"],
  },
  watchtowerHook: false,
  providerKeys: false,
};

beforeEach(() => {
  _resetSubstrateConfigCache();
  api.config.mockResolvedValue(CONFIG);
  api.validateEgress.mockImplementation(
    async (req: { egressHosts?: string[] }) => ({
      hostErrors: (req.egressHosts ?? []).map((h) =>
        /^\d/.test(h)
          ? `"${h}": IP addresses are not allowed, name a public hostname`
          : null,
      ),
      error: null,
      hosts: [],
    }),
  );
  api.create.mockResolvedValue({ id: "sess-1", state: "creating" });
});
afterEach(() => vi.clearAllMocks());

const launchButton = () => screen.getByRole("button", { name: "Launch" });

describe("AgentLaunchDialog", () => {
  it("hides the substrate backend when config answers 404 (flag off)", async () => {
    api.config.mockRejectedValue(
      new SubstrateApiError(404, "substrate-disabled", "off"),
    );
    const onLaunchContainer = vi.fn();
    render(
      <AgentLaunchDialog
        open
        onOpenChange={() => {}}
        onLaunchContainer={onLaunchContainer}
      />,
    );
    await waitFor(() => expect(api.config).toHaveBeenCalled());
    expect(screen.queryByLabelText("Substrate")).toBeNull();
    fireEvent.click(launchButton());
    expect(onLaunchContainer).toHaveBeenCalledWith("claude");
  });

  it("offers substrate when enabled, with the five agents, no Kiro, and the nono hint", async () => {
    render(
      <AgentLaunchDialog
        open
        onOpenChange={() => {}}
        onLaunchContainer={vi.fn()}
        defaultBackend="substrate"
      />,
    );
    expect(await screen.findByLabelText("Substrate")).toBeInTheDocument();
    for (const a of [
      "Claude Code",
      "Codex CLI",
      "Gemini CLI",
      "OpenCode",
      "GitHub Copilot",
    ])
      expect(screen.getByText(a)).toBeInTheDocument();
    expect(screen.queryByText(/kiro/i)).toBeNull();
    expect(
      screen.getByText(/nono in-sandbox policy is active only on microVM/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("launch-template")).toHaveTextContent(
      "daax-claude-gvisor-abc",
    );
    expect(screen.getByText("provisional")).toBeInTheDocument();
  });

  it("an agent with no deployed template cannot launch", async () => {
    render(
      <AgentLaunchDialog
        open
        onOpenChange={() => {}}
        defaultBackend="substrate"
      />,
    );
    fireEvent.click(await screen.findByLabelText(/Codex CLI/));
    expect(screen.getByTestId("launch-template")).toHaveTextContent(
      /No ActorTemplate is deployed/,
    );
    expect(launchButton()).toBeDisabled();
  });

  it("shows an invalid extra host inline and blocks launch", async () => {
    render(
      <AgentLaunchDialog
        open
        onOpenChange={() => {}}
        defaultBackend="substrate"
      />,
    );
    const input = await screen.findByPlaceholderText(/api\.example\.com/);
    fireEvent.change(input, { target: { value: "10.0.0.1" } });
    fireEvent.click(screen.getByRole("button", { name: "Add host" }));
    expect(
      await screen.findByText(/IP addresses are not allowed/),
    ).toBeInTheDocument();
    expect(launchButton()).toBeDisabled();
  });

  it("creates with agent, class and egress only (the provisional branch is not sent)", async () => {
    const onLaunched = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <AgentLaunchDialog
        open
        onOpenChange={onOpenChange}
        defaultBackend="substrate"
        onLaunchedSubstrate={onLaunched}
      />,
    );
    fireEvent.click(await screen.findByLabelText(/microVM/));
    fireEvent.click(screen.getByLabelText(/npm/));
    fireEvent.change(screen.getByLabelText("Branch"), {
      target: { value: "agent/claude" },
    });
    await waitFor(() => expect(launchButton()).toBeEnabled());
    fireEvent.click(launchButton());
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create).toHaveBeenCalledWith({
      agent: "claude",
      sandboxClass: "microvm",
      egressPresets: ["npm"],
      egressHosts: [],
    });
    await waitFor(() =>
      expect(onLaunched).toHaveBeenCalledWith({
        id: "sess-1",
        state: "creating",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows a create error inline", async () => {
    api.create.mockRejectedValue(
      new SubstrateApiError(
        400,
        "invalid-egress",
        "hosts resolving to private addresses are not allowed",
      ),
    );
    render(
      <AgentLaunchDialog
        open
        onOpenChange={() => {}}
        defaultBackend="substrate"
      />,
    );
    await screen.findByLabelText("Substrate");
    await waitFor(() => expect(launchButton()).toBeEnabled());
    fireEvent.click(launchButton());
    expect(
      await screen.findByText(/private addresses are not allowed/),
    ).toBeInTheDocument();
  });
});
