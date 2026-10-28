"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface HealthData {
  status: "ok" | "degraded";
  llm_configured: boolean;
  database: "ok" | "error";
}

interface IntakeResponse {
  status: "needs_info" | "ready";
  session_id: string;
  round: number;
  questions: string[];
  brief: {
    summary: string;
    users: string;
    domain_hint: string;
    data_involved: string[];
    stated_constraints: Array<{ id: string; text: string }>;
    numbers_given: Array<{ label: string; value: string }>;
    assumptions: string[];
  } | null;
}

interface DesignResponse {
  id: string;
  intake_session_id: string;
  current_version: number;
  spec: {
    nodes: Array<{ id: string; name: string; type: string; role: string }>;
    edges: Array<{ from: string; to: string; flows: string }>;
    constraints: Array<{ id: string; text: string; kind: string }>;
  };
  flow_order: string[];
  prompt_version: string;
}

async function fetchHealth(): Promise<HealthData> {
  const res = await fetch("/api/health");
  if (!res.ok) {
    throw new Error(`Health check failed with status: ${res.status}`);
  }
  return res.json();
}

export default function HomePage() {
  const { data, error, isLoading, refetch, isFetching } = useQuery<HealthData>({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  // TEMP(phase-3): Test harness state for Phase 3 intake dialogue and design generation
  const [inputText, setInputText] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [intakeData, setIntakeData] = useState<IntakeResponse | null>(null);
  const [designData, setDesignData] = useState<DesignResponse | null>(null);
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [designLoading, setDesignLoading] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  async function handleSendTurn() {
    if (!inputText.trim()) return;
    setIntakeLoading(true);
    setTestError(null);
    try {
      const res = await fetch("/api/intake/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId,
          text: inputText.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || `Intake turn error: ${res.status}`);
      }
      setIntakeData(json);
      setSessionId(json.session_id);
      setInputText("");
    } catch (err: unknown) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setIntakeLoading(false);
    }
  }

  async function handleCreateDesign() {
    if (!sessionId) return;
    setDesignLoading(true);
    setTestError(null);
    try {
      const res = await fetch("/api/designs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.message || `Design creation error: ${res.status}`);
      }
      setDesignData(json);
    } catch (err: unknown) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setDesignLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start p-6">
      <div className="w-full max-w-2xl space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Arch-Nemesis</h1>
          <p className="text-sm text-muted-foreground">
            Architecture Design Platform
          </p>
        </header>

        {/* System Health Card */}
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
            <CardDescription>
              Backend API & Database Connectivity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading && (
              <p className="text-sm text-muted-foreground" data-testid="status-loading">
                Checking system status...
              </p>
            )}

            {error ? (
              <div className="space-y-2" data-testid="status-error">
                <p className="text-sm font-medium text-destructive">
                  API not reachable
                </p>
                <p className="text-xs text-muted-foreground">
                  Ensure the backend API service is running on http://127.0.0.1:8000
                </p>
              </div>
            ) : data ? (
              <div className="space-y-3" data-testid="status-healthy">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">API Status:</span>
                  <span
                    className={
                      data.status === "ok"
                        ? "font-medium text-green-600 dark:text-green-400"
                        : "font-medium text-amber-600 dark:text-amber-400"
                    }
                  >
                    {data.status === "ok" ? "API healthy" : "API degraded"}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Database:</span>
                  <span
                    className={
                      data.database === "ok"
                        ? "font-medium text-green-600 dark:text-green-400"
                        : "font-medium text-destructive"
                    }
                  >
                    {data.database}
                  </span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">LLM Configured:</span>
                  <span className="font-medium">
                    {data.llm_configured ? "Configured" : "Not configured"}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                {isFetching ? "Refreshing..." : "Refresh Status"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* // TEMP(phase-3): Temporary Test UI for Phase 3 Intake & Generator */}
        <Card data-testid="phase3-test-harness">
          <CardHeader>
            <CardTitle>Phase 3 Verification Harness</CardTitle>
            <CardDescription>
              Test Intake Turn Dialogue and Generator Execution
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {testError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                {testError}
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="turn-input" className="text-xs font-semibold uppercase text-muted-foreground">
                Describe Business Need / Response
              </label>
              <textarea
                id="turn-input"
                className="w-full min-h-[100px] p-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="e.g. We need an automated invoice processing pipeline with human review before ERP payment."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={intakeLoading || designLoading}
              />
              <Button
                className="w-full"
                onClick={handleSendTurn}
                disabled={intakeLoading || !inputText.trim()}
              >
                {intakeLoading ? "Processing Turn..." : "Send Intake Turn"}
              </Button>
            </div>

            {intakeData && (
              <div className="mt-4 p-4 border rounded-md bg-muted/40 space-y-3 text-sm">
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Session: {intakeData.session_id}</span>
                  <span>Round: {intakeData.round} / 3</span>
                  <span className="font-medium text-foreground uppercase">{intakeData.status}</span>
                </div>

                {intakeData.questions && intakeData.questions.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">Clarifying Questions:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {intakeData.questions.map((q, idx) => (
                        <li key={idx} className="text-muted-foreground">{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {intakeData.brief && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="font-medium text-foreground">Requirement Brief:</p>
                    <p className="text-xs text-muted-foreground">{intakeData.brief.summary}</p>
                    {intakeData.brief.stated_constraints.length > 0 && (
                      <div className="text-xs space-y-1">
                        <span className="font-semibold">Constraints:</span>
                        <ul className="list-disc list-inside">
                          {intakeData.brief.stated_constraints.map((c) => (
                            <li key={c.id}>[{c.id}] {c.text}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full mt-2"
                      onClick={handleCreateDesign}
                      disabled={designLoading}
                    >
                      {designLoading ? "Synthesizing Architecture..." : "Generate Architecture Design"}
                    </Button>
                  </div>
                )}
              </div>
            )}

            {designData && (
              <div className="mt-4 p-4 border rounded-md bg-muted/50 space-y-3 text-sm">
                <div className="flex justify-between items-center text-xs text-muted-foreground">
                  <span>Design ID: {designData.id}</span>
                  <span>v{designData.current_version} ({designData.prompt_version})</span>
                </div>
                <div className="text-xs space-y-1">
                  <p className="font-semibold">Topological Flow Order:</p>
                  <p className="text-muted-foreground font-mono">{designData.flow_order.join(" -> ")}</p>
                </div>
                <div className="text-xs space-y-1">
                  <p className="font-semibold">Nodes ({designData.spec.nodes.length}) & Edges ({designData.spec.edges.length}):</p>
                  <pre className="p-2 bg-background border rounded text-[11px] overflow-x-auto max-h-48 font-mono">
                    {JSON.stringify(designData.spec, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
