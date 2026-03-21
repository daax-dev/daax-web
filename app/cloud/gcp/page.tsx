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
  Database,
  HardDrive,
  Network,
  Shield,
  Key,
  Settings,
} from "lucide-react";

const services = [
  { name: "GKE", description: "Managed Kubernetes", icon: Server },
  { name: "Compute Engine", description: "Virtual machines", icon: Server },
  { name: "Cloud SQL", description: "Managed databases", icon: Database },
  { name: "Cloud Storage", description: "Object storage", icon: HardDrive },
  { name: "VPC", description: "Virtual networks", icon: Network },
  { name: "IAM", description: "Identity & Access", icon: Shield },
];

export default function GcpPage() {
  return (
    <div className="space-y-6">
      {/* Connection Status */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🔵</span>
              <div>
                <CardTitle>Google Cloud Platform</CardTitle>
                <CardDescription>
                  Connect your GCP project to manage resources
                </CardDescription>
              </div>
            </div>
            <Button variant="outline">
              <Key className="h-4 w-4 mr-2" />
              Configure Credentials
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Settings className="h-4 w-4" />
            <span>No GCP credentials configured</span>
          </div>
        </CardContent>
      </Card>

      {/* Services Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">GCP Services</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Card key={service.name} className="opacity-50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Icon className="h-5 w-5 text-blue-500" />
                    </div>
                    <div>
                      <p className="font-medium">{service.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {service.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
