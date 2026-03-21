"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Cloud,
  Server,
  Database,
  Network,
  Shield,
  Activity,
} from "lucide-react";
import Link from "next/link";

const providers = [
  {
    name: "Amazon Web Services",
    href: "/cloud/aws",
    description: "EC2, EKS, Lambda, S3, and more",
    icon: "🔶",
    color: "bg-orange-500/10 text-orange-500",
  },
  {
    name: "Google Cloud Platform",
    href: "/cloud/gcp",
    description: "GKE, Cloud Run, BigQuery, and more",
    icon: "🔵",
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    name: "Microsoft Azure",
    href: "/cloud/azure",
    description: "AKS, Functions, Cosmos DB, and more",
    icon: "🔷",
    color: "bg-cyan-500/10 text-cyan-500",
  },
  {
    name: "Kubernetes",
    href: "/cloud/kubernetes",
    description: "Cluster management and workloads",
    icon: "⎈",
    color: "bg-indigo-500/10 text-indigo-500",
  },
];

const stats = [
  { label: "Active Clusters", value: "—", icon: Server },
  { label: "Running Services", value: "—", icon: Activity },
  { label: "Databases", value: "—", icon: Database },
  { label: "Networks", value: "—", icon: Network },
];

export default function CloudPage() {
  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-muted">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">
                      {stat.label}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Cloud Providers */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Cloud Providers</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {providers.map((provider) => (
            <Link key={provider.href} href={provider.href}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{provider.icon}</span>
                    <div>
                      <CardTitle className="text-base">
                        {provider.name}
                      </CardTitle>
                      <CardDescription>{provider.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Shield className="h-4 w-4" />
                    <span>Not configured</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Coming Soon */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Cloud className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">Multi-Cloud Management</h3>
          <p className="text-muted-foreground text-center max-w-md">
            Connect your cloud accounts to manage infrastructure, deploy
            workloads, and monitor resources across AWS, GCP, Azure, and
            Kubernetes.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
