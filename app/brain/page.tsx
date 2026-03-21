"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Brain,
  BookOpen,
  Search,
  History,
  Lightbulb,
  Database,
  FileText,
  MessageSquare,
} from "lucide-react";
import Link from "next/link";

const features = [
  {
    name: "Knowledge Base",
    href: "/brain/knowledge",
    description:
      "Store and organize project knowledge, documentation, and learnings",
    icon: BookOpen,
    color: "bg-blue-500/10 text-blue-500",
  },
  {
    name: "Semantic Search",
    href: "/brain/search",
    description: "Search across all your knowledge using natural language",
    icon: Search,
    color: "bg-green-500/10 text-green-500",
  },
  {
    name: "Conversation History",
    href: "/brain/history",
    description: "Review and search past AI conversations and decisions",
    icon: History,
    color: "bg-purple-500/10 text-purple-500",
  },
  {
    name: "AI Insights",
    href: "/brain/insights",
    description: "Patterns and insights learned from your development workflow",
    icon: Lightbulb,
    color: "bg-yellow-500/10 text-yellow-500",
  },
];

const stats = [
  { label: "Knowledge Items", value: "—", icon: FileText },
  { label: "Conversations", value: "—", icon: MessageSquare },
  { label: "Total Tokens", value: "—", icon: Database },
  { label: "Insights", value: "—", icon: Lightbulb },
];

export default function BrainPage() {
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

      {/* Features Grid */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Brain Features</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Link key={feature.href} href={feature.href}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${feature.color}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {feature.name}
                        </CardTitle>
                        <CardDescription>{feature.description}</CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Coming Soon */}
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Brain className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">AI Memory & Learning</h3>
          <p className="text-muted-foreground text-center max-w-md">
            The Brain module will store project context, track conversations,
            and help AI assistants learn from your codebase and preferences over
            time.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
