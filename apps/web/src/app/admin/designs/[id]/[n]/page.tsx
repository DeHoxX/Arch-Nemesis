"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, KeyRound, RefreshCw } from "lucide-react";

import { Banner } from "@/components/Banner";
import { BlockDiagramView } from "@/components/diagram/BlockDiagramView";
import { DetailPanel } from "@/components/diagram/DetailPanel";
import { DiagramView } from "@/components/diagram/DiagramView";
import { NotesPanel } from "@/components/diagram/NotesPanel";
import { ExplanationView } from "@/components/explanation/ExplanationView";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiError, getAdminDesignVersion } from "@/lib/api";
import type { AdminDesignVersionResponse } from "@/lib/types";
import { useAdminToken } from "../../../context";

function AdminDesignInspectionLoading(): React.ReactElement {
  return (
    <main className="relative min-h-screen w-full bg-page-bg text-foreground px-4 py-8 md:py-12">
      <div className="relative mx-auto w-full max-w-7xl space-y-6">
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-9 w-48 rounded-lg" />
        <Skeleton className="h-[580px] w-full rounded-2xl" />
      </div>
    </main>
  );
}

function AdminDesignInspectionContent(): React.ReactElement {
  const params = useParams();
  const designId = typeof params?.id === "string" ? params.id : "";
  const versionRaw = typeof params?.n === "string" ? params.n : "1";
  const versionNo = parseInt(versionRaw, 10) || 1;

  const queryClient = useQueryClient();
  const { token, setToken } = useAdminToken();
  const [inputToken, setInputToken] = useState("");
  const [authError, setAuthError] = useState<"401" | "404" | "500" | "network" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const {
    data,
    isLoading: isQueryLoading,
    error: queryError,
    refetch,
  } = useQuery<AdminDesignVersionResponse, ApiError | Error>({
    queryKey: ["adminDesignVersion", designId, versionNo, token],
    queryFn: async () => {
      if (!token) throw new Error("No token");
      try {
        return await getAdminDesignVersion(token, designId, versionNo);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setToken(null);
            setAuthError("401");
            setErrorMessage("Not authorised.");
          } else if (err.status === 404) {
            setAuthError("404");
            setErrorMessage("Design version not found or admin disabled.");
          } else if (err.status >= 500) {
            setAuthError("500");
            setErrorMessage(
              "Unable to load design version (backend internal error or incompatible data format)."
            );
          }
        }
        throw err;
      }
    },
    enabled: Boolean(token && designId),
    retry: false,
  });

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = inputToken.trim();
    if (!cleanToken) return;

    setIsVerifying(true);
    setAuthError(null);
    setErrorMessage(null);

    try {
      const res = await getAdminDesignVersion(cleanToken, designId, versionNo);
      queryClient.setQueryData(
        ["adminDesignVersion", designId, versionNo, cleanToken],
        res
      );
      setToken(cleanToken);
    } catch (err: unknown) {
      setToken(null);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setAuthError("401");
          setErrorMessage("Not authorised.");
        } else if (err.status === 404) {
          setAuthError("404");
          setErrorMessage("Design version not found or admin disabled.");
        } else if (err.status >= 500) {
          setAuthError("500");
          setErrorMessage(
            "Unable to load design version (backend internal error or incompatible data format)."
          );
        } else {
          setAuthError("network");
          setErrorMessage(err.message || "Failed to load design version.");
        }
      } else {
        setAuthError("network");
        setErrorMessage(
          err instanceof Error ? err.message : "Network error occurred."
        );
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const isLoading = isVerifying || isQueryLoading;

  const effectiveError =
    authError ||
    (queryError instanceof ApiError && queryError.status === 401
      ? "401"
      : queryError instanceof ApiError && queryError.status === 404
        ? "404"
        : queryError instanceof ApiError && queryError.status >= 500
          ? "500"
          : queryError
            ? "network"
            : null);

  const effectiveErrorMessage =
    errorMessage ||
    (queryError instanceof ApiError && queryError.status === 401
      ? "Not authorised."
      : queryError instanceof ApiError && queryError.status === 404
        ? "Design version not found or admin disabled."
        : queryError instanceof ApiError && queryError.status >= 500
          ? "Unable to load design version (backend internal error or incompatible data format)."
          : queryError instanceof Error
            ? queryError.message
            : null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectedNode =
    selectedNodeId && data?.spec?.nodes
      ? data.spec.nodes.find((n) => n.id === selectedNodeId) ?? null
      : null;

  const selectedEdge = (() => {
    if (!selectedEdgeId || !data?.spec?.edges) return null;
    const sorted = [...data.spec.edges].sort((a, b) => {
      const fromComp = a.from.localeCompare(b.from);
      if (fromComp !== 0) return fromComp;
      const toComp = a.to.localeCompare(b.to);
      if (toComp !== 0) return toComp;
      return a.flows.localeCompare(b.flows);
    });
    const foundIdx = sorted.findIndex((e, idx) => `e-${e.from}-${e.to}-${idx}` === selectedEdgeId);
    if (foundIdx !== -1) return sorted[foundIdx] ?? null;
    return (
      data.spec.edges.find(
        (e) =>
          `${e.from}__${e.to}` === selectedEdgeId ||
          `${e.from}-${e.to}` === selectedEdgeId ||
          (e as { id?: string }).id === selectedEdgeId,
      ) ?? null
    );
  })();

  return (
    <main className="relative min-h-screen w-full bg-page-bg text-foreground px-4 py-8 md:py-12">
      {/* Background static grid */}
      <div
        className="pointer-events-none absolute inset-0 page-grid-bg"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-7xl space-y-6">
        {/* Top Navigation */}
        <div className="flex items-center justify-between border-b border-border/40 pb-4">
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Back to Leads
          </Link>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-border/80 bg-card/60 px-3 py-1 text-xs font-mono text-muted-foreground">
              Admin Inspection Mode
            </span>
          </div>
        </div>

        {/* Inline Admin Token Prompt (Shown if token is null on direct visit or 401) */}
        {!token || !data ? (
          <div className="mx-auto w-full max-w-md space-y-6 pt-12">
            <div className="text-center space-y-2">
              <div className="mx-auto size-12 rounded-full border border-border/80 bg-card/60 flex items-center justify-center backdrop-blur-md">
                <KeyRound className="size-6 text-brand-accent" />
              </div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                Admin Token Required
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter your administrative secret token to inspect this design version.
              </p>
            </div>

            {effectiveError === "401" && (
              <Alert variant="destructive" className="rounded-xl border-destructive/60 bg-destructive/10">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-sm font-semibold">Authentication Failed</AlertTitle>
                <AlertDescription className="text-xs font-medium">
                  {effectiveErrorMessage || "Not authorised."}
                </AlertDescription>
              </Alert>
            )}

            {effectiveError === "404" && (
              <Alert variant="destructive" className="rounded-xl border-destructive/60 bg-destructive/10">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-sm font-semibold">Not Found</AlertTitle>
                <AlertDescription className="text-xs font-medium">
                  {effectiveErrorMessage || "Design version not found or admin disabled."}
                </AlertDescription>
              </Alert>
            )}

            {effectiveError === "500" && (
              <Alert variant="destructive" className="rounded-xl border-destructive/60 bg-destructive/10">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-sm font-semibold">Incompatible Data Format</AlertTitle>
                <AlertDescription className="text-xs font-medium">
                  {effectiveErrorMessage || "Unable to load design version (backend internal error or incompatible data format)."}
                </AlertDescription>
              </Alert>
            )}

            {effectiveError === "network" && (
              <Alert variant="destructive" className="rounded-xl border-destructive/60 bg-destructive/10">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-sm font-semibold">Error</AlertTitle>
                <AlertDescription className="text-xs font-medium">
                  {effectiveErrorMessage || "Failed to load design version."}
                </AlertDescription>
              </Alert>
            )}

            {/* Inline password form (preserves on-page position) */}
            <form
              onSubmit={handleTokenSubmit}
              className="rounded-2xl border border-border/80 bg-card/80 p-6 shadow-xl backdrop-blur-md space-y-4"
            >
              <div className="space-y-2">
                <label
                  htmlFor="admin-design-token"
                  className="block text-xs font-mono uppercase tracking-wider text-muted-foreground"
                >
                  Admin Secret Token
                </label>
                <Input
                  id="admin-design-token"
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="Enter token..."
                  disabled={isLoading}
                  autoComplete="off"
                  className="bg-transparent font-mono text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || !inputToken.trim()}
                className="w-full bg-brand-accent text-brand-accent-ink hover:bg-brand-accent-hover font-semibold text-xs h-9 gap-2 transition-colors"
              >
                {isLoading && <RefreshCw className="size-3.5 animate-spin" />}
                {isLoading ? "Verifying..." : "Unlock Design Version"}
              </Button>
            </form>
          </div>
        ) : (
          /* Authenticated Design Inspection View (Strictly Read-Only) */
          <div className="space-y-6">
            <Banner />

            {/* Design Version Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-4">
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                  {data.brief.summary || "System Architecture"}
                </h1>
                <p className="text-xs font-mono text-muted-foreground mt-1">
                  Design ID: {designId} • Version {versionNo}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void refetch()}
                disabled={isLoading}
                className="text-xs font-mono gap-1.5 h-8"
              >
                <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            {/* Read-Only Tabs: Block diagram vs Architecture vs Explanation */}
            <Tabs defaultValue="block-diagram" className="w-full space-y-4">
              <TabsList className="bg-card/60 border border-border/60">
                <TabsTrigger value="block-diagram" className="text-xs font-medium">
                  Block diagram
                </TabsTrigger>
                <TabsTrigger value="architecture" className="text-xs font-medium">
                  Architecture
                </TabsTrigger>
                <TabsTrigger value="explanation" className="text-xs font-medium">
                  Explanation
                </TabsTrigger>
              </TabsList>

              <TabsContent value="block-diagram" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Read-only Block Diagram Canvas */}
                  <div className="lg:col-span-3 h-[calc(100vh-260px)] min-h-[600px] max-h-[850px] rounded-lg border border-border bg-card overflow-hidden relative">
                    <BlockDiagramView spec={data.spec} />
                  </div>

                  {/* Summary / Notes Panel */}
                  <div className="space-y-4">
                    <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
                      <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        User / Audience
                      </h2>
                      <p className="text-xs text-foreground/90">{data.brief.users || "General"}</p>
                    </div>

                    {data.warnings.length > 0 && <NotesPanel warnings={data.warnings} />}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="architecture" className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Read-only Architecture Canvas */}
                  <div className="lg:col-span-3 h-[calc(100vh-260px)] min-h-[600px] max-h-[850px] rounded-lg border border-border bg-card overflow-hidden relative">
                    <DiagramView
                      spec={data.spec}
                      flowOrder={data.flow_order}
                      selectedNodeId={selectedNodeId}
                      onSelectNode={(nodeId) => {
                        setSelectedNodeId(nodeId);
                        if (nodeId !== null) setSelectedEdgeId(null);
                      }}
                      selectedEdgeId={selectedEdgeId}
                      onSelectEdge={(edgeId) => {
                        setSelectedEdgeId(edgeId);
                        if (edgeId !== null) setSelectedNodeId(null);
                      }}
                    />
                  </div>

                  {/* Summary / Notes Panel + DetailPanel when selected */}
                  <div className="space-y-4">
                    {Boolean(selectedNode || selectedEdge) && (
                      <DetailPanel
                        node={selectedNode}
                        edge={selectedEdge}
                        spec={data.spec}
                        onClose={() => {
                          setSelectedNodeId(null);
                          setSelectedEdgeId(null);
                        }}
                        onSelectNode={(nodeId) => {
                          setSelectedEdgeId(null);
                          setSelectedNodeId(nodeId);
                        }}
                      />
                    )}

                    <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
                      <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                        User / Audience
                      </h2>
                      <p className="text-xs text-foreground/90">{data.brief.users || "General"}</p>
                    </div>

                    {data.warnings.length > 0 && <NotesPanel warnings={data.warnings} />}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="explanation" className="space-y-4">
                {/* Pure presenter: NEVER triggers POST /explanation or LLM synthesis */}
                {data.explanation ? (
                  <ExplanationView explanation={data.explanation} />
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-card/20 p-12 text-center space-y-2">
                    <p className="text-sm font-medium text-foreground">No explanation generated yet.</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      This design version has not had a walkthrough generated by a visitor.
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </main>
  );
}

export default function AdminDesignInspectionPage(): React.ReactElement {
  return (
    <Suspense fallback={<AdminDesignInspectionLoading />}>
      <AdminDesignInspectionContent />
    </Suspense>
  );
}
