/**
 * Tailscale Hosts Configuration
 *
 * Defines the network hosts available for remote agent execution.
 * Each host can run coding agents via the communication protocol.
 */

export type OSType = "linux" | "windows" | "macos" | "raspberry-pi";

export interface TailscaleHost {
  id: string;
  name: string;
  displayName: string;
  ip: string;
  os: OSType;
  description?: string;
  // Future: agents running on this host
  agents?: string[];
}

export const tailscaleHosts: TailscaleHost[] = [
  {
    id: "adare",
    name: "adare",
    displayName: "Adare",
    ip: "100.126.164.47",
    os: "linux",
    description: "Primary development server",
  },
  {
    id: "dublin",
    name: "dublin",
    displayName: "Dublin",
    ip: "100.75.140.34",
    os: "linux",
    description: "Build server",
  },
  {
    id: "galway",
    name: "galway",
    displayName: "Galway",
    ip: "100.112.65.66",
    os: "linux",
    description: "Testing environment",
  },
  {
    id: "cork",
    name: "cork",
    displayName: "Cork",
    ip: "100.109.109.79",
    os: "windows",
    description: "Windows development",
  },
  {
    id: "kinsale",
    name: "kinsale",
    displayName: "Kinsale",
    ip: "100.80.179.13",
    os: "linux",
    description: "Staging server",
  },
  {
    id: "muckross",
    name: "muckross",
    displayName: "Muckross",
    ip: "100.114.129.63",
    os: "linux",
    description: "Production mirror",
  },
  {
    id: "pi5",
    name: "pi5",
    displayName: "Pi5",
    ip: "100.108.216.55",
    os: "raspberry-pi",
    description: "Raspberry Pi 5",
  },
  {
    id: "chamonix",
    name: "chamonix",
    displayName: "Chamonix",
    ip: "100.68.102.87",
    os: "macos",
    description: "macOS development",
  },
];

/**
 * Get a host by ID
 */
export function getHost(id: string): TailscaleHost | undefined {
  return tailscaleHosts.find((h) => h.id === id);
}

/**
 * Get all hosts of a specific OS type
 */
export function getHostsByOS(os: OSType): TailscaleHost[] {
  return tailscaleHosts.filter((h) => h.os === os);
}
