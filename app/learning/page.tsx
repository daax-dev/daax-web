"use client";

import {
  Lightbulb,
  BookOpen,
  GraduationCap,
  Brain,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LearningPage() {
  return (
    <div className="container mx-auto py-6 px-4 max-w-screen-2xl">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="h-6 w-6" />
            Learning
          </h1>
          <p className="text-muted-foreground">
            AI learning resources, training materials, and educational content
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-500" />
                Documentation
              </CardTitle>
              <CardDescription>Guides and reference materials</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Coming soon: Interactive documentation for Daax features and
                workflows.
              </p>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-green-500" />
                Tutorials
              </CardTitle>
              <CardDescription>Step-by-step learning paths</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Coming soon: Guided tutorials for AI-assisted development
                workflows.
              </p>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="h-5 w-5 text-purple-500" />
                AI Training
              </CardTitle>
              <CardDescription>Custom model fine-tuning</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Coming soon: Tools for training AI models on your codebase
                patterns.
              </p>
            </CardContent>
          </Card>

          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-yellow-500" />
                Best Practices
              </CardTitle>
              <CardDescription>Tips and recommendations</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Coming soon: Curated best practices for AI-assisted development.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="p-4 rounded-lg border border-dashed bg-muted/30">
          <p className="text-sm text-muted-foreground text-center">
            This feature is in{" "}
            <span className="text-red-400 font-medium">ALPHA</span>. More
            learning resources coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
