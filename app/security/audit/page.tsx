"use client";

import {
  ClipboardCheck,
  FileText,
  Download,
  CheckCircle2,
  Clock,
  Shield,
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
import { Checkbox } from "@/components/ui/checkbox";

export default function AuditCompliancePage() {
  return (
    <div className="container max-w-screen-2xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            Audit & Compliance
          </h1>
          <p className="text-muted-foreground">
            Security audits and compliance reporting
          </p>
        </div>
        <Badge variant="destructive">ALPHA</Badge>
      </div>

      {/* Compliance Frameworks */}
      <Card>
        <CardHeader>
          <CardTitle>Compliance Frameworks</CardTitle>
          <CardDescription>
            Track compliance status across frameworks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="border rounded-lg p-4 text-center">
              <div className="font-medium mb-2">SOC 2 Type II</div>
              <div className="text-2xl font-bold text-green-500 mb-2">78%</div>
              <Progress value={78} className="mb-2" />
              <div className="text-xs text-muted-foreground">compliant</div>
              <Button variant="link" size="sm" className="mt-2" disabled>
                Details
              </Button>
            </div>

            <div className="border rounded-lg p-4 text-center">
              <div className="font-medium mb-2">SLSA Level 3</div>
              <div className="text-2xl font-bold text-yellow-500 mb-2">45%</div>
              <Progress value={45} className="mb-2" />
              <div className="text-xs text-muted-foreground">compliant</div>
              <Button variant="link" size="sm" className="mt-2" disabled>
                Details
              </Button>
            </div>

            <div className="border rounded-lg p-4 text-center">
              <div className="font-medium mb-2">CIS Benchmarks</div>
              <div className="text-2xl font-bold text-green-500 mb-2">92%</div>
              <Progress value={92} className="mb-2" />
              <div className="text-xs text-muted-foreground">compliant</div>
              <Button variant="link" size="sm" className="mt-2" disabled>
                Details
              </Button>
            </div>

            <div className="border rounded-lg p-4 text-center">
              <div className="font-medium mb-2">Custom Framework</div>
              <div className="text-2xl font-bold text-muted-foreground mb-2">
                --
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Not configured
              </div>
              <Button variant="outline" size="sm" className="mt-2" disabled>
                Setup
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Sample data. Connect to compliance data sources for real metrics.
          </p>
        </CardContent>
      </Card>

      {/* Audit Reports */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Audit Reports
            </CardTitle>
            <CardDescription>
              Generate and manage security audit reports
            </CardDescription>
          </div>
          <Button disabled>Generate New Report</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">
                  Security Audit Report - December 2025
                </div>
                <div className="text-sm text-muted-foreground">
                  Generated: 2025-12-29 | Coverage: Full stack (infra, app,
                  deps)
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" disabled>
                View
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4 mr-1" />
                PDF
              </Button>
              <Button variant="outline" size="sm" disabled>
                <Download className="h-4 w-4 mr-1" />
                JSON
              </Button>
            </div>
          </div>

          <div className="border rounded-lg p-4 border-dashed">
            <div className="flex items-center gap-3 text-muted-foreground">
              <FileText className="h-5 w-5" />
              <div>
                <div className="font-medium">No previous reports</div>
                <div className="text-sm">
                  Generate your first audit report to get started
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Evidence Collection */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Evidence Collection
            </CardTitle>
            <CardDescription>
              Automated evidence for compliance audits
            </CardDescription>
          </div>
          <Button variant="outline" disabled>
            Export Evidence Bundle
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox id="sbom" defaultChecked disabled />
            <label htmlFor="sbom" className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Container image SBOMs
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="dep-audit" defaultChecked disabled />
            <label
              htmlFor="dep-audit"
              className="text-sm flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Dependency audit logs
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="access" defaultChecked disabled />
            <label htmlFor="access" className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Access control configurations
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="scan-results" defaultChecked disabled />
            <label
              htmlFor="scan-results"
              className="text-sm flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Security scan results
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="pentest" disabled />
            <label
              htmlFor="pentest"
              className="text-sm flex items-center gap-2"
            >
              <Clock className="h-4 w-4 text-muted-foreground" />
              Penetration test reports
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Audit Trail */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Audit Trail</CardTitle>
            <CardDescription>Security-relevant events log</CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled>
            View Full Log
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between p-2 border-b">
              <span className="text-muted-foreground">2025-12-29 14:32</span>
              <span>Secret scan completed (0 findings)</span>
            </div>
            <div className="flex items-center justify-between p-2 border-b">
              <span className="text-muted-foreground">2025-12-29 14:30</span>
              <span>Container image scanned</span>
            </div>
            <div className="flex items-center justify-between p-2 border-b">
              <span className="text-muted-foreground">2025-12-29 12:15</span>
              <span>Security config updated</span>
            </div>
            <div className="flex items-center justify-between p-2">
              <span className="text-muted-foreground">2025-12-29 10:00</span>
              <span>Compliance check scheduled</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Sample data. Events are stored locally.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
