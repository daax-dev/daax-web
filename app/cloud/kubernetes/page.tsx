"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Server,
  Box,
  Layers,
  Network,
  Shield,
  Key,
  Settings,
  Plus,
} from "lucide-react";

const resources = [
  {
    name: "Clusters",
    description: "Kubernetes clusters",
    icon: Server,
    count: "—",
  },
  {
    name: "Namespaces",
    description: "Logical partitions",
    icon: Layers,
    count: "—",
  },
  {
    name: "Deployments",
    description: "Workload deployments",
    icon: Box,
    count: "—",
  },
  {
    name: "Services",
    description: "Network services",
    icon: Network,
    count: "—",
  },
  { name: "Secrets", description: "Sensitive data", icon: Shield, count: "—" },
];

export default function KubernetesPage() {
  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">⎈</span>
              <div>
                <CardTitle>Kubernetes</CardTitle>
                <CardDescription>
                  Manage Kubernetes clusters and workloads
                </CardDescription>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Key className="h-4 w-4 mr-2" />
                Add Kubeconfig
              </Button>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Connect Cluster
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4" />
            <span>No clusters connected</span>
          </div>
        </CardContent>
      </Card>

      {/* Resources Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Cluster Resources</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {resources.map((resource) => {
            const Icon = resource.icon;
            return (
              <Card key={resource.name} className="opacity-50">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="p-3 rounded-lg bg-indigo-500/10">
                      <Icon className="h-6 w-6 text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">{resource.count}</p>
                      <p className="text-sm font-medium">{resource.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {resource.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Server className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Kubernetes Management</h3>
          <p className="text-muted-foreground text-center max-w-md mb-4">
            Connect your Kubernetes clusters to deploy workloads, manage
            resources, and monitor cluster health from a unified dashboard.
          </p>
          <div className="flex gap-2">
            <Button variant="outline">Import from Cloud</Button>
            <Button>Add Local Cluster</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
