"use client";

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

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Arch-Nemesis</h1>
          <p className="text-sm text-muted-foreground">
            Foundation Health Status
          </p>
        </header>

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
      </div>
    </main>
  );
}
