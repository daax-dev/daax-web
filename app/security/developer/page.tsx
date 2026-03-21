"use client";

import {
  Bug,
  Search,
  Shield,
  FileCode,
  Settings2,
  AlertTriangle,
  XCircle,
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
import { Checkbox } from "@/components/ui/checkbox";

export default function DeveloperSecurityPage() {
  return (
    <div className="container max-w-screen-2xl py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bug className="h-6 w-6" />
            Developer Security
          </h1>
          <p className="text-muted-foreground">
            Shift-left security tools for developers
          </p>
        </div>
        <Badge variant="destructive">ALPHA</Badge>
      </div>

      {/* Scanner Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Secret Scanner
            </CardTitle>
            <CardDescription>
              Scan for leaked secrets, API keys, and tokens in code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="outline" disabled>
              Run Scan
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Integration: gitleaks, trufflehog
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Dependency Scan
            </CardTitle>
            <CardDescription>
              Check for vulnerable dependencies in your project
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="outline" disabled>
              Run Scan
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Integration: npm audit, Snyk, Trivy
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCode className="h-5 w-5" />
              SAST Scanner
            </CardTitle>
            <CardDescription>
              Static Application Security Testing for code
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" variant="outline" disabled>
              Run Scan
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Integration: Semgrep, CodeQL
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Findings */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Findings</CardTitle>
          <CardDescription>
            Security issues detected in your codebase
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 text-sm font-medium">
                    Severity
                  </th>
                  <th className="text-left p-3 text-sm font-medium">Finding</th>
                  <th className="text-left p-3 text-sm font-medium">File</th>
                  <th className="text-left p-3 text-sm font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="p-3">
                    <Badge variant="destructive">Critical</Badge>
                  </td>
                  <td className="p-3 text-sm">Hardcoded API key detected</td>
                  <td className="p-3 text-sm font-mono text-muted-foreground">
                    src/api/config.ts
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-1 text-sm text-yellow-600">
                      <AlertTriangle className="h-4 w-4" />
                      Open
                    </span>
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="p-3">
                    <Badge
                      variant="secondary"
                      className="bg-yellow-500/20 text-yellow-600"
                    >
                      High
                    </Badge>
                  </td>
                  <td className="p-3 text-sm">
                    Vulnerable dependency: lodash &lt;4.17.21
                  </td>
                  <td className="p-3 text-sm font-mono text-muted-foreground">
                    package.json
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-1 text-sm text-yellow-600">
                      <AlertTriangle className="h-4 w-4" />
                      Open
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="p-3">
                    <Badge
                      variant="secondary"
                      className="bg-green-500/20 text-green-600"
                    >
                      Low
                    </Badge>
                  </td>
                  <td className="p-3 text-sm">
                    SQL injection (false positive)
                  </td>
                  <td className="p-3 text-sm font-mono text-muted-foreground">
                    src/db/queries.ts
                  </td>
                  <td className="p-3">
                    <span className="flex items-center gap-1 text-sm text-muted-foreground">
                      <XCircle className="h-4 w-4" />
                      Dismissed
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Showing sample data. Run a scan to see actual findings.
          </p>
        </CardContent>
      </Card>

      {/* Pre-Commit Hooks */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Pre-Commit Hooks
            </CardTitle>
            <CardDescription>
              Automate security checks before commits
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled>
            Configure
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox id="secret-hook" defaultChecked disabled />
            <label htmlFor="secret-hook" className="text-sm">
              Run secret scanner before commit
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="dep-hook" defaultChecked disabled />
            <label htmlFor="dep-hook" className="text-sm">
              Run dependency audit before push
            </label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox id="sast-hook" disabled />
            <label htmlFor="sast-hook" className="text-sm">
              Run SAST on changed files
            </label>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Integrates with Flowspec pre-commit templates
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
