"use client";

import { useState } from "react";
import {
  Shield,
  Eye,
  FileWarning,
  Container,
  Network,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Server,
  Flag,
  Play,
  Square,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function CyberToolkitPage() {
  const [authorized, setAuthorized] = useState(false);

  return (
    <div className="container max-w-screen-2xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Cyber Toolkit
          </h1>
          <p className="text-muted-foreground">
            Defensive and offensive security tools
          </p>
        </div>
        <Badge variant="destructive">ALPHA</Badge>
      </div>

      <Tabs defaultValue="defensive" className="space-y-4">
        <TabsList>
          <TabsTrigger value="defensive" className="flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Defensive
          </TabsTrigger>
          <TabsTrigger value="offensive" className="flex items-center gap-2">
            <FileWarning className="h-4 w-4" />
            Offensive
          </TabsTrigger>
        </TabsList>

        {/* Defensive / Blue Team */}
        <TabsContent value="defensive" className="space-y-6">
          {/* Security Posture Dashboard */}
          <Card>
            <CardHeader>
              <CardTitle>Security Posture Dashboard</CardTitle>
              <CardDescription>
                Overall security health of your environment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-3xl font-bold text-red-500">12</div>
                  <div className="text-sm text-muted-foreground">Critical</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-3xl font-bold text-yellow-500">34</div>
                  <div className="text-sm text-muted-foreground">High</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-3xl font-bold text-green-500">156</div>
                  <div className="text-sm text-muted-foreground">Low</div>
                </div>
                <div className="text-center p-4 border rounded-lg">
                  <div className="text-3xl font-bold">72</div>
                  <div className="text-sm text-muted-foreground">
                    Score /100
                  </div>
                  <Progress value={72} className="mt-2" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Sample data. Connect scanners to see real metrics.
              </p>
            </CardContent>
          </Card>

          {/* Container Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Container className="h-5 w-5" />
                Container Security
              </CardTitle>
              <CardDescription>
                Image scanning and SBOM generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">daax-agents:latest</span>
                  <Badge
                    variant="secondary"
                    className="bg-yellow-500/20 text-yellow-600"
                  >
                    3 critical, 12 high
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground space-y-1">
                  <div>Base: node:20-alpine</div>
                  <div>Last scanned: 2 hours ago</div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" disabled>
                    View SBOM
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    Scan Now
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    View Report
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Integration: Trivy, Syft, Grype
              </p>
            </CardContent>
          </Card>

          {/* Runtime Monitoring */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Runtime Monitoring
              </CardTitle>
              <CardDescription>
                Monitor container behavior in real-time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <div>
                    <div className="font-medium">daax-main</div>
                    <div className="text-sm text-muted-foreground">
                      Running - No alerts
                    </div>
                  </div>
                </div>
                <Badge variant="secondary">Running</Badge>
              </div>

              <div className="flex items-center justify-between p-3 border rounded-lg border-yellow-500/50">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <div>
                    <div className="font-medium">claude-session-abc</div>
                    <div className="text-sm text-yellow-600">
                      Unusual network activity detected
                    </div>
                  </div>
                </div>
                <Badge variant="secondary">Running</Badge>
              </div>

              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" disabled>
                  View All Alerts
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Configure Rules
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Integration: Falco (planned)
              </p>
            </CardContent>
          </Card>

          {/* Network Security */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="h-5 w-5" />
                Network Security
              </CardTitle>
              <CardDescription>Outbound connection monitoring</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 text-sm">
                  <span className="font-mono">api.anthropic.com</span>
                  <span className="text-muted-foreground">
                    1,234 requests (Claude API)
                  </span>
                </div>
                <div className="flex items-center justify-between p-2 text-sm">
                  <span className="font-mono">github.com</span>
                  <span className="text-muted-foreground">56 requests</span>
                </div>
                <div className="flex items-center justify-between p-2 text-sm border border-yellow-500/50 rounded bg-yellow-500/10">
                  <span className="font-mono text-yellow-600">
                    unknown-host.example.com
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-yellow-600">3 requests</span>
                    <Button variant="outline" size="sm" disabled>
                      Investigate
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Last 24 hours. Integration: eBPF, Docker network logs
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Offensive / Red Team */}
        <TabsContent value="offensive" className="space-y-6">
          {!authorized ? (
            <Card className="border-yellow-500/50 bg-yellow-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <AlertTriangle className="h-5 w-5" />
                  Authorization Required
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm">
                  Offensive security tools require explicit authorization. By
                  proceeding, you confirm:
                </p>
                <ul className="text-sm list-disc list-inside space-y-1 text-muted-foreground">
                  <li>You have permission to test the target systems</li>
                  <li>
                    You understand these tools can cause disruption if misused
                  </li>
                  <li>All activities will be logged for audit purposes</li>
                  <li>
                    You will only test systems you own or have written
                    authorization to test
                  </li>
                </ul>
                <Button onClick={() => setAuthorized(true)} className="mt-4">
                  I have authorization - Proceed
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Testing Tools */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Globe className="h-5 w-5" />
                      Web App Testing
                    </CardTitle>
                    <CardDescription>
                      DAST scanning for web applications
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" variant="outline" disabled>
                      Configure
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Integration: ZAP, Nuclei
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Server className="h-5 w-5" />
                      API Security
                    </CardTitle>
                    <CardDescription>
                      API fuzzing and auth bypass testing
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" variant="outline" disabled>
                      Configure
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Integration: OWASP ZAP, custom scripts
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Container className="h-5 w-5" />
                      Container Escape Testing
                    </CardTitle>
                    <CardDescription>
                      Test container isolation boundaries
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button className="w-full" variant="outline" disabled>
                      Configure
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Integration: Custom breakout scripts
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Active Engagements */}
              <Card>
                <CardHeader>
                  <CardTitle>Active Engagements</CardTitle>
                  <CardDescription>
                    Manage security testing campaigns
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-medium">API Security Test</div>
                        <div className="text-sm text-muted-foreground">
                          Target: http://localhost:4200/api/*
                        </div>
                      </div>
                      <Badge
                        variant="secondary"
                        className="bg-blue-500/20 text-blue-600"
                      >
                        Running
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Progress</span>
                        <span>45%</span>
                      </div>
                      <Progress value={45} />
                      <div className="text-sm text-muted-foreground">
                        Findings:{" "}
                        <span className="text-red-500">2 critical</span>,{" "}
                        <span className="text-yellow-500">5 high</span>
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <Button variant="outline" size="sm" disabled>
                        <Play className="h-4 w-4 mr-1" />
                        View Progress
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        <Square className="h-4 w-4 mr-1" />
                        Stop
                      </Button>
                      <Button variant="outline" size="sm" disabled>
                        Export Report
                      </Button>
                    </div>
                  </div>

                  <Button variant="outline" disabled>
                    New Engagement
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Sample data. Engagements are stored locally.
                  </p>
                </CardContent>
              </Card>

              {/* CTF Challenges */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Flag className="h-5 w-5" />
                      CTF Challenges
                    </CardTitle>
                    <CardDescription>
                      Practice security skills with capture-the-flag challenges
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">Coming Soon</Badge>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Practice security skills with built-in capture-the-flag
                    challenges running in isolated containers. Learn offensive
                    techniques in a safe environment.
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
