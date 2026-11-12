"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";

import { Banner } from "@/components/Banner";
import { BlockDiagramView } from "@/components/diagram/BlockDiagramView";
import { ConstraintsPanel } from "@/components/diagram/ConstraintsPanel";
import { DetailPanel } from "@/components/diagram/DetailPanel";
import { DiagramView } from "@/components/diagram/DiagramView";
import { FallbackList } from "@/components/diagram/FallbackList";
import { NotesPanel } from "@/components/diagram/NotesPanel";
import { ConfirmDropModal } from "@/components/refine/ConfirmDropModal";
import { PatchCard } from "@/components/refine/PatchCard";
import { RefinePanel } from "@/components/refine/RefinePanel";
import { VersionsPanel } from "@/components/refine/VersionsPanel";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactDialog } from "@/components/contact/ContactDialog";
import { ExplanationView } from "@/components/explanation/ExplanationView";
import { ExportButtons } from "@/components/export/ExportButtons";
import {
  acceptPatch,
  ApiError,
  getDesign,
  getDesignVersion,
  getMessages,
  getVersions,
  postChat,
  postExplanation,
  postSuggestions,
  rejectPatch,
  restoreVersion,
} from "@/lib/api";
import { buildUnionGraph } from "@/lib/diff";
import { updateHistoryEntryTitle } from "@/lib/history";
import type { ArchitectureSpec, PatchSummary, SuggestionItemResponse, UnionArchitectureSpec } from "@/lib/types";

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

function DesignContent(): React.ReactElement {
  const params = useParams();
  const rawId = params?.id;
  const id: string =
    typeof rawId === "string"
      ? rawId
      : Array.isArray(rawId) && rawId.length > 0 && typeof rawId[0] === "string"
        ? rawId[0]
        : "";

  const queryClient = useQueryClient();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("block-diagram");
  const [isContactOpen, setIsContactOpen] = useState<boolean>(false);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [pendingPatch, setPendingPatch] = useState<PatchSummary | null>(null);
  const [isConfirmDropOpen, setIsConfirmDropOpen] = useState<boolean>(false);
  const [droppedRequirements, setDroppedRequirements] = useState<string[]>([]);
  const [isAccepting, setIsAccepting] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);
  const [isSendingChat, setIsSendingChat] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<SuggestionItemResponse[]>([]);
  const [discardedCount, setDiscardedCount] = useState<number>(0);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState<string>("");
  const diagramContainerRef = useRef<HTMLDivElement>(null);

  // Responsive switch: >= 768px mounts canvas, < 768px mounts FallbackList
  const isDesktop = useMediaQuery("(min-width: 768px)", true);

  // Fetch current design specification via TanStack Query
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

  // Sync loaded design title into local storage history
  useEffect(() => {
    if (design?.id && design?.title) {
      updateHistoryEntryTitle(design.id, design.title);
    }
  }, [design?.id, design?.title]);

  const currentVersion = design?.current_version ?? 1;
  const isViewingHistorical =
    viewingVersion !== null &&
    design !== undefined &&
    viewingVersion !== currentVersion;

  // Fetch historical version if viewing a past version
  const { data: historicalDesign } = useQuery({
    queryKey: ["design-version", id, viewingVersion],
    queryFn: () => getDesignVersion(id, viewingVersion!),
    enabled: Boolean(id) && isViewingHistorical,
    staleTime: Infinity,
  });

  // Fetch version history list
  const { data: versionsData } = useQuery({
    queryKey: ["design-versions", id],
    queryFn: () => getVersions(id),
    enabled: Boolean(id) && Boolean(design),
  });
  const versionsList = versionsData?.versions ?? [];

  // Fetch refinement conversation message history
  const { data: messagesData } = useQuery({
    queryKey: ["design-messages", id],
    queryFn: () => getMessages(id),
    enabled: Boolean(id) && Boolean(design),
  });
  const messagesList = messagesData?.messages ?? [];

  // Active design resolved between current and historical
  const activeDesign = isViewingHistorical && historicalDesign ? historicalDesign : design;
  const activeVersion = activeDesign?.current_version ?? currentVersion;

  // Lazy explanation fetch: only if not already present on design and tab is active
  const hasExistingExplanation = Boolean(activeDesign?.explanation);

  const {
    data: generatedExplanation,
    isLoading: isExplanationLoading,
    isError: isExplanationError,
    error: explanationError,
    refetch: refetchExplanation,
  } = useQuery({
    queryKey: ["design-explanation", id, activeVersion],
    queryFn: () => postExplanation(id, activeVersion),
    enabled:
      Boolean(id) &&
      Boolean(activeDesign) &&
      activeTab === "explanation" &&
      !hasExistingExplanation,
    staleTime: Infinity,
    retry: false,
  });

  const activeExplanation = activeDesign?.explanation ?? generatedExplanation;

  // Keyboard accessibility: Escape clears selected node and edge
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

  // Derive selected node from spec
  const selectedNode =
    selectedNodeId && activeDesign?.spec?.nodes
      ? activeDesign.spec.nodes.find((n) => n.id === selectedNodeId) ?? null
      : null;

  // Clear diagram selection before PNG capture so exported image is at full opacity
  const handleBeforeExportPng = async () => {
    if (selectedNodeId !== null || selectedEdgeId !== null) {
      setSelectedNodeId(null);
    setSelectedEdgeId(null);
      setSelectedEdgeId(null);
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        await new Promise((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(resolve);
          });
        });
      } else {
        await new Promise((resolve) => setTimeout(resolve, 32));
      }
    }
  };

  // Union graph feeding diagrams during pending patch review
  const displaySpec: ArchitectureSpec | UnionArchitectureSpec = useMemo(() => {
    if (!activeDesign) {
      return { nodes: [], edges: [], constraints: [], entry_ids: [], exit_ids: [] };
    }
    if (
      pendingPatch &&
      (pendingPatch.status === "proposed" || pendingPatch.status === "needs_confirmation") &&
      !isViewingHistorical
    ) {
      return buildUnionGraph(activeDesign.spec, pendingPatch);
    }
    return activeDesign.spec;
  }, [activeDesign, pendingPatch, isViewingHistorical]);

  // Derive selected edge from displaySpec
  const selectedEdge = useMemo(() => {
    if (!selectedEdgeId || !displaySpec?.edges) return null;
    const sorted = [...displaySpec.edges].sort((a, b) => {
      const fromComp = a.from.localeCompare(b.from);
      if (fromComp !== 0) return fromComp;
      const toComp = a.to.localeCompare(b.to);
      if (toComp !== 0) return toComp;
      return a.flows.localeCompare(b.flows);
    });
    const foundIdx = sorted.findIndex((e, idx) => `e-${e.from}-${e.to}-${idx}` === selectedEdgeId);
    if (foundIdx !== -1) return sorted[foundIdx] ?? null;
    return (
      displaySpec.edges.find(
        (e) =>
          `${e.from}__${e.to}` === selectedEdgeId ||
          `${e.from}-${e.to}` === selectedEdgeId ||
          (e as { id?: string }).id === selectedEdgeId,
      ) ?? null
    );
  }, [selectedEdgeId, displaySpec?.edges]);

  const nodesKey = useMemo(
    () => displaySpec.nodes.map((n) => n.id).sort().join(","),
    [displaySpec.nodes],
  );

  // Refinement Handlers
  const handleSendMessage = async (text: string) => {
    if (!id || isSendingChat || isViewingHistorical) return;
    setIsSendingChat(true);
    setChatDraft("");

    try {
      const res = await postChat(id, text);
      await queryClient.invalidateQueries({ queryKey: ["design-messages", id] });

      if (res.patch) {
        setPendingPatch(res.patch);
        if (res.patch.status === "needs_confirmation") {
          const dropped = res.patch.issues
            .filter((i) => i.code === "E_BRIEF_CONSTRAINT_UNCOVERED")
            .map((i) => i.message);
          setDroppedRequirements(
            dropped.length > 0
              ? dropped
              : ["One or more stated brief requirements will stop being checked."]
          );
        }
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "STALE_PATCH") {
          setPendingPatch(null);
          await queryClient.invalidateQueries({ queryKey: ["design", id] });
        }
      }
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleAskSuggestions = async () => {
    if (!id || isLoadingSuggestions || isSendingChat || isViewingHistorical || Boolean(pendingPatch)) {
      return;
    }
    setIsLoadingSuggestions(true);
    setSuggestionsError(null);

    try {
      const res = await postSuggestions(id);
      setSuggestions(res.suggestions);
      setDiscardedCount(res.discarded_count);
      await queryClient.invalidateQueries({ queryKey: ["design-messages", id] });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "CAP_TURNS") {
          setSuggestionsError(err.message);
        } else if (err.status === 503 || err.status === 429) {
          setSuggestionsError("Suggestions are temporarily unavailable. Please try again.");
        } else {
          setSuggestionsError(err.message || "Failed to fetch suggestions.");
        }
      } else {
        setSuggestionsError("Failed to fetch suggestions.");
      }
    } finally {
      setIsLoadingSuggestions(false);
    }
  };

  const handleApplySuggestion = (suggestion: SuggestionItemResponse) => {
    if (!suggestion || Boolean(pendingPatch) || isViewingHistorical) return;

    const diff = suggestion.diff;
    const opsCount = diff
      ? diff.added_nodes.length +
        diff.removed_nodes.length +
        diff.changed_nodes.length +
        diff.added_edges.length +
        diff.removed_edges.length +
        diff.changed_edges.length +
        diff.added_constraints.length +
        diff.removed_constraints.length +
        diff.changed_constraints.length
      : 0;

    const patchSummary: PatchSummary = {
      id: suggestion.patch_id,
      status: suggestion.status,
      diff: suggestion.diff,
      issues: suggestion.issues ?? [],
      ops_count: opsCount,
      preview_spec: suggestion.preview_spec ?? null,
    };

    setPendingPatch(patchSummary);

    if (suggestion.status === "needs_confirmation") {
      const dropped = (suggestion.issues ?? [])
        .filter((i) => i.code === "E_BRIEF_CONSTRAINT_UNCOVERED")
        .map((i) => i.message);
      setDroppedRequirements(
        dropped.length > 0
          ? dropped
          : ["One or more stated brief requirements will stop being checked."],
      );
    }
  };

  const handleAcceptPatch = async (confirmDrop = false) => {
    if (!id || !pendingPatch || isAccepting) return;

    if (pendingPatch.status === "needs_confirmation" && !confirmDrop) {
      setIsConfirmDropOpen(true);
      return;
    }

    setIsAccepting(true);

    try {
      const updatedDesign = await acceptPatch(id, pendingPatch.id, confirmDrop);
      queryClient.setQueryData(["design", id], updatedDesign);
      setPendingPatch(null);
      setSuggestions([]);
      setDiscardedCount(0);
      setSuggestionsError(null);
      setIsConfirmDropOpen(false);
      setViewingVersion(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["design-versions", id] }),
        queryClient.invalidateQueries({ queryKey: ["design-messages", id] }),
      ]);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "CONFIRMATION_REQUIRED") {
          setIsConfirmDropOpen(true);
        } else if (err.code === "STALE_PATCH") {
          setPendingPatch(null);
          setIsConfirmDropOpen(false);
          await queryClient.invalidateQueries({ queryKey: ["design", id] });
        } else if (err.code === "PATCH_BLOCKED") {
          setPendingPatch((prev) =>
            prev
              ? {
                  ...prev,
                  status: "blocked",
                  issues: (err.issues ?? []).map((msg) => ({
                    code: "E_PATCH_BLOCKED",
                    message: msg,
                    severity: "error",
                    ids: [],
                  })),
                }
              : null
          );
          setIsConfirmDropOpen(false);
        }
      }
    } finally {
      setIsAccepting(false);
    }
  };

  const handleRejectPatch = async () => {
    if (!id || !pendingPatch || isRejecting) return;
    setIsRejecting(true);

    try {
      await rejectPatch(id, pendingPatch.id);
      setPendingPatch(null);
      setIsConfirmDropOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["design-messages", id] });
    } catch {
      // Graceful reject fallback
      setPendingPatch(null);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDismissBlockedPatch = () => {
    setPendingPatch(null);
  };

  const handleViewVersion = (versionNo: number) => {
    if (versionNo === currentVersion) {
      setViewingVersion(null);
    } else {
      setViewingVersion(versionNo);
    }
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  };

  const handleRestoreVersion = async (versionNo: number) => {
    if (!id || versionNo === currentVersion || isRestoring) return;
    setIsRestoring(true);

    try {
      const restoredDesign = await restoreVersion(id, versionNo);
      queryClient.setQueryData(["design", id], restoredDesign);
      setPendingPatch(null);
      setSuggestions([]);
      setDiscardedCount(0);
      setSuggestionsError(null);
      setViewingVersion(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["design-versions", id] }),
        queryClient.invalidateQueries({ queryKey: ["design-messages", id] }),
      ]);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === "STALE_PATCH") {
        await queryClient.invalidateQueries({ queryKey: ["design", id] });
      }
    } finally {
      setIsRestoring(false);
    }
  };

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
      <main className="relative min-h-screen w-full bg-page-bg text-foreground px-4 py-12 md:py-16 selection:bg-brand-accent selection:text-brand-accent-ink">
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
    <main className="relative min-h-screen w-full bg-page-bg text-foreground px-4 py-8 md:py-12 selection:bg-brand-accent selection:text-brand-accent-ink">
      {/* Background subtle static grid pattern, no animated grid, no grain */}
      <div
        className="pointer-events-none absolute inset-0 page-grid-bg"
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
              versionNo={activeDesign?.current_version ?? currentVersion}
              explanation={activeDesign?.explanation || null}
              diagramContainerRef={diagramContainerRef}
              onBeforeExportPng={handleBeforeExportPng}
            />
            <Button asChild variant="outline" size="sm" className="text-xs font-mono">
              <Link href="/?new=1">New design</Link>
            </Button>
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
              <span className="size-2 rounded-full bg-brand-accent" />
              v{activeDesign?.current_version ?? currentVersion}
              {isViewingHistorical ? " (historical view)" : ` (${design.prompt_version})`}
            </div>
          </div>
        </header>

        <ContactDialog
          open={isContactOpen}
          onOpenChange={setIsContactOpen}
          designId={design.id}
          versionNo={activeDesign?.current_version ?? currentVersion}
        />

        <ConfirmDropModal
          open={isConfirmDropOpen}
          onOpenChange={setIsConfirmDropOpen}
          droppedRequirements={droppedRequirements}
          onConfirm={() => handleAcceptPatch(true)}
          isLoading={isAccepting}
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
                  className="h-[calc(100vh-260px)] min-h-[600px] max-h-[850px] w-full rounded-lg border border-border bg-card overflow-hidden relative"
                >
                  <BlockDiagramView
                    spec={displaySpec}
                    fitViewTrigger={pendingPatch ? pendingPatch.id : null}
                    nodesKey={nodesKey}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <FallbackList
                  spec={displaySpec}
                  flowOrder={activeDesign?.flow_order ?? []}
                />
              )}
            </div>

            {/* Notes and Constraints below the block diagram */}
            <div className="space-y-6 pt-2">
              <NotesPanel
                warnings={activeDesign?.warnings ?? []}
                unverifiableRequirements={activeDesign?.brief?.unverifiable_requirements ?? []}
              />
              <ConstraintsPanel constraints={activeDesign?.spec?.constraints ?? []} />
            </div>
          </TabsContent>

          <TabsContent value="architecture" className="space-y-6 outline-none focus-visible:ring-0">
            {/* Architecture area and DetailPanel grid */}
            {(() => {
              const hasSelection = Boolean(selectedNode || selectedEdge);
              return (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <div className={hasSelection ? "lg:col-span-8 w-full" : "lg:col-span-12 w-full"}>
                    {isDesktop ? (
                      <div
                        ref={diagramContainerRef}
                        className="h-[calc(100vh-260px)] min-h-[600px] max-h-[850px] w-full rounded-lg border border-border bg-card overflow-hidden relative"
                      >
                        <DiagramView
                          spec={displaySpec}
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
                          fitViewTrigger={pendingPatch ? pendingPatch.id : null}
                          nodesKey={nodesKey}
                          className="h-full w-full"
                        />
                      </div>
                    ) : (
                      <FallbackList
                        spec={displaySpec}
                        flowOrder={activeDesign?.flow_order ?? []}
                        selectedNodeId={selectedNodeId}
                        onSelectNode={(nodeId) => {
                          setSelectedNodeId(nodeId);
                          if (nodeId !== null) setSelectedEdgeId(null);
                        }}
                      />
                    )}
                  </div>

                  {hasSelection && (
                    <div className="lg:col-span-4 w-full">
                      <DetailPanel
                        node={selectedNode}
                        edge={selectedEdge}
                        spec={activeDesign?.spec ?? displaySpec}
                        onClose={() => {
                          setSelectedNodeId(null);
                          setSelectedEdgeId(null);
                        }}
                        onSelectNode={(nodeId) => {
                          setSelectedEdgeId(null);
                          setSelectedNodeId(nodeId);
                        }}
                        onPrefillChat={(text) => setChatDraft(text)}
                        disabledShortcuts={Boolean(pendingPatch) || isViewingHistorical}
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Notes and Constraints below the architecture diagram */}
            <div className="space-y-6 pt-2">
              <NotesPanel
                warnings={activeDesign?.warnings ?? []}
                unverifiableRequirements={activeDesign?.brief?.unverifiable_requirements ?? []}
              />
              <ConstraintsPanel constraints={activeDesign?.spec?.constraints ?? []} />
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

        {/* Refinement & Version History: 2 columns on lg (7 cols RefinePanel, 5 cols VersionsPanel), 1 column below 1024px */}
        <section className="pt-6" aria-label="Design Refinement and History">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 w-full">
              <RefinePanel
                messages={messagesList}
                turnsUsed={messagesData?.turns_used}
                maxTurns={messagesData?.max_turns}
                versionsCount={versionsList.length > 0 ? versionsList.length : currentVersion}
                isSending={isSendingChat}
                isViewingHistorical={isViewingHistorical}
                hasPendingPatch={Boolean(pendingPatch)}
                draft={chatDraft}
                onDraftChange={setChatDraft}
                patchCard={
                  pendingPatch ? (
                    <PatchCard
                      patch={pendingPatch}
                      onAccept={() => handleAcceptPatch(false)}
                      onReject={handleRejectPatch}
                      onDismiss={handleDismissBlockedPatch}
                      isAccepting={isAccepting}
                      isRejecting={isRejecting}
                      note={
                        activeTab === "explanation"
                          ? "Switch to Block diagram or Architecture tab to review the visual diff."
                          : undefined
                      }
                    />
                  ) : null
                }
                onSendMessage={handleSendMessage}
                suggestions={suggestions}
                discardedCount={discardedCount}
                isLoadingSuggestions={isLoadingSuggestions}
                suggestionsError={suggestionsError}
                onAskSuggestions={handleAskSuggestions}
                onApplySuggestion={handleApplySuggestion}
              />
            </div>
            <div className="lg:col-span-5 w-full">
              <VersionsPanel
                versions={versionsList}
                currentVersion={currentVersion}
                viewingVersion={viewingVersion}
                onViewVersion={handleViewVersion}
                onRestoreVersion={handleRestoreVersion}
                isRestoring={isRestoring}
              />
            </div>
          </div>
        </section>
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
