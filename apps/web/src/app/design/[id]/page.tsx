"use client";

import React, { Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";

import { Banner } from "@/components/Banner";
import { BlockDiagramView } from "@/components/diagram/BlockDiagramView";
import { ConstraintsPanel } from "@/components/diagram/ConstraintsPanel";
import { DetailPanel } from "@/components/diagram/DetailPanel";
import { DiagramView } from "@/components/diagram/DiagramView";
import { FallbackList } from "@/components/diagram/FallbackList";
import { NotesPanel } from "@/components/diagram/NotesPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactDialog } from "@/components/contact/ContactDialog";
import { ExplanationView } from "@/components/explanation/ExplanationView";
import { ExportButtons } from "@/components/export/ExportButtons";
import { ApiError, getDesign, postExplanation } from "@/lib/api";

/**
 * SSR-safe and hydration-safe media query hook.
 *
 * Requirements (BUILD_PLAN.md:442 & Stage 4C2):
 * - Evaluates media queries (e.g. min-width: 768px) safely.
 * - During SSR and initial hydration, returns serverFallback to prevent hydration mismatch.
 * - Handles missing window.matchMedia gracefully without crashing.
 */
function useMediaQuery(query: string, serverFallback = true): boolean {
  const subscribe = useCallback(
    (callback: () => void) => {
      if (typeof window === "undefined" || !("matchMedia" in window)) {
        return () => {};
      }
      const media = window.matchMedia(query);
      media.addEventListener("change", callback);
      return () => media.removeEventListener("change", callback);
    },
    [query]
  );

  const getSnapshot = () => {
    if (typeof window === "undefined" || !("matchMedia" in window)) {
      return serverFallback;
    }
    return window.matchMedia(query).matches;
  };

  const getServerSnapshot = () => serverFallback;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function DesignPageLoading(): React.ReactElement {
  return (
    <main className="relative min-h-screen w-full bg-[var(--page-bg)] text-[#f4f4f5] px-4 py-8 md:py-12">
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

function DesignContent(): React.ReactElement {
  const params = useParams();
  const rawId = params?.id;
  const id: string =
    typeof rawId === "string"
      ? rawId
      : Array.isArray(rawId) && rawId.length > 0 && typeof rawId[0] === "string"
        ? rawId[0]
        : "";

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("block-diagram");
  const [isContactOpen, setIsContactOpen] = useState<boolean>(false);
  const diagramContainerRef = useRef<HTMLDivElement>(null);

  // Responsive switch: >= 768px mounts canvas, < 768px mounts FallbackList
  const isDesktop = useMediaQuery("(min-width: 768px)", true);

  // Fetch design specification via TanStack Query and Zod-validated api.ts
  const {
    data: design,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["design", id],
    queryFn: () => getDesign(id),
    enabled: Boolean(id),
  });

  // Lazy explanation fetch: only if not already present on design and tab is active
  const version = design?.current_version ?? 1;
  const hasExistingExplanation = Boolean(design?.explanation);

  const {
    data: generatedExplanation,
    isLoading: isExplanationLoading,
    isError: isExplanationError,
    error: explanationError,
    refetch: refetchExplanation,
  } = useQuery({
    queryKey: ["design-explanation", id, version],
    queryFn: () => postExplanation(id, version),
    enabled:
      Boolean(id) &&
      Boolean(design) &&
      activeTab === "explanation" &&
      !hasExistingExplanation,
    staleTime: Infinity,
    retry: false,
  });

  const activeExplanation = design?.explanation ?? generatedExplanation;

  // Keyboard accessibility: Escape clears selected node
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedNodeId(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Derive selected node from spec
  const selectedNode =
    selectedNodeId && design?.spec?.nodes
      ? design.spec.nodes.find((n) => n.id === selectedNodeId) ?? null
      : null;

  // Loading State
  if (isLoading || !design) {
    if (isError) {
      // Fall through to error handler below
    } else {
      return <DesignPageLoading />;
    }
  }

  // Error State: 404 Not Found vs other API/Network/Zod errors
  if (isError) {
    const isNotFound =
      error instanceof ApiError &&
      (error.status === 404 || error.code === "NOT_FOUND");

    return (
      <main className="relative min-h-screen w-full bg-[var(--page-bg)] text-[#f4f4f5] px-4 py-12 md:py-16 selection:bg-[#ccff00] selection:text-black">
        <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center">
          <header className="mb-8 text-center space-y-2">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-mono text-muted-foreground backdrop-blur-md hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3" /> Arch-Nemesis
            </Link>
          </header>

          <Alert
            variant="destructive"
            className="rounded-2xl border-destructive/60 bg-destructive/10 p-6 text-card-foreground shadow-lg backdrop-blur-sm"
          >
            <AlertCircle className="size-5 text-destructive" />
            <AlertTitle className="text-base font-semibold text-foreground">
              {isNotFound ? "Design Not Found" : "Error Loading Design"}
            </AlertTitle>
            <AlertDescription className="mt-2 space-y-4 text-sm">
              <p className="text-muted-foreground leading-relaxed break-words">
                {isNotFound
                  ? "We could not find that design."
                  : error instanceof Error
                    ? error.message
                    : "An unexpected error occurred while loading this design."}
              </p>
              <div className="pt-2 flex items-center gap-3">
                {isNotFound ? (
                  <Button asChild variant="outline" size="sm" className="font-semibold text-xs">
                    <Link href="/">Back to home</Link>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => refetch()}
                    className="font-semibold text-xs gap-1.5"
                  >
                    <RefreshCw className="size-3.5" /> Retry
                  </Button>
                )}
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen w-full bg-[var(--page-bg)] text-[#f4f4f5] px-4 py-8 md:py-12 selection:bg-[#ccff00] selection:text-black">
      {/* Background subtle static grid pattern, no animated grid, no grain */}
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#27272a15_1px,transparent_1px),linear-gradient(to_bottom,#27272a15_1px,transparent_1px)] bg-[size:32px_32px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-7xl">
        {/* Page Chrome Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border/40 pb-4">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="size-3.5" /> Back to intake
            </Link>
            <span className="text-muted-foreground/40 font-mono">/</span>
            <span className="text-xs font-mono text-foreground font-semibold">
              Design {design.id}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ExportButtons
              designId={design.id || id}
              versionNo={design.current_version}
              explanation={design.explanation || null}
              diagramContainerRef={diagramContainerRef}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsContactOpen(true)}
              className="text-xs font-mono"
            >
              Contact our team
            </Button>
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-mono text-muted-foreground backdrop-blur-md">
              <span className="size-2 rounded-full bg-[#ccff00]" />
              v{design.current_version} ({design.prompt_version})
            </div>
          </div>
        </header>

        <ContactDialog
          open={isContactOpen}
          onOpenChange={setIsContactOpen}
          designId={design.id}
          versionNo={design.current_version}
        />

        {/* Compliance Banner: Always visible above the tabs */}
        <div className="mb-6">
          <Banner />
        </div>

        {/* Tabs: Block diagram, Architecture, and Explanation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
          <TabsList className="bg-card/80 border border-border/60 p-1">
            <TabsTrigger value="block-diagram" className="px-4 py-1.5 text-xs font-mono">
              Block diagram
            </TabsTrigger>
            <TabsTrigger value="architecture" className="px-4 py-1.5 text-xs font-mono">
              Architecture
            </TabsTrigger>
            <TabsTrigger value="explanation" className="px-4 py-1.5 text-xs font-mono">
              Explanation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="block-diagram" className="space-y-6 outline-none focus-visible:ring-0">
            {/* Simple Block Diagram area */}
            <div className="w-full">
              {isDesktop ? (
                <div
                  ref={diagramContainerRef}
                  className="h-[calc(100vh-260px)] min-h-[600px] max-h-[850px] w-full rounded-2xl border border-border/80 bg-card/60 shadow-lg backdrop-blur-sm overflow-hidden relative"
                >
                  <BlockDiagramView
                    spec={design.spec}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <FallbackList
                  spec={design.spec}
                  flowOrder={design.flow_order}
                />
              )}
            </div>

            {/* Notes and Constraints below the block diagram */}
            <div className="space-y-6 pt-2">
              <NotesPanel
                warnings={design.warnings}
                unverifiableRequirements={design.brief.unverifiable_requirements}
              />
              <ConstraintsPanel constraints={design.spec.constraints} />
            </div>
          </TabsContent>

          <TabsContent value="architecture" className="space-y-6 outline-none focus-visible:ring-0">
            {/* Architecture area and DetailPanel grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className={selectedNode ? "lg:col-span-8 w-full" : "lg:col-span-12 w-full"}>
                {isDesktop ? (
                  <div
                    ref={diagramContainerRef}
                    className="h-[calc(100vh-260px)] min-h-[600px] max-h-[850px] w-full rounded-2xl border border-border/80 bg-card/60 shadow-lg backdrop-blur-sm overflow-hidden relative"
                  >
                    <DiagramView
                      spec={design.spec}
                      selectedNodeId={selectedNodeId}
                      onSelectNode={setSelectedNodeId}
                      className="h-full w-full"
                    />
                  </div>
                ) : (
                  <FallbackList
                    spec={design.spec}
                    flowOrder={design.flow_order}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                  />
                )}
              </div>

              {selectedNode && (
                <div className="lg:col-span-4 w-full">
                  <DetailPanel
                    node={selectedNode}
                    spec={design.spec}
                    onClose={() => setSelectedNodeId(null)}
                  />
                </div>
              )}
            </div>

            {/* Notes and Constraints below the architecture diagram */}
            <div className="space-y-6 pt-2">
              <NotesPanel
                warnings={design.warnings}
                unverifiableRequirements={design.brief.unverifiable_requirements}
              />
              <ConstraintsPanel constraints={design.spec.constraints} />
            </div>
          </TabsContent>

          <TabsContent value="explanation" className="outline-none focus-visible:ring-0">
            <ExplanationView
              explanation={activeExplanation}
              isLoading={!hasExistingExplanation && isExplanationLoading}
              error={isExplanationError ? explanationError : null}
              onRetry={() => refetchExplanation()}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

export default function DesignPage(): React.ReactElement {
  return (
    <Suspense fallback={<DesignPageLoading />}>
      <DesignContent />
    </Suspense>
  );
}
