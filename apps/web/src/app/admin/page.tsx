"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, KeyRound, LogOut, RefreshCw, Users } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudioBackground } from "@/components/studio/StudioBackground";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, getAdminLeads } from "@/lib/api";
import type { AdminLeadItem } from "@/lib/types";
import { useAdminToken } from "./context";

export default function AdminLeadsPage(): React.ReactElement {
  const queryClient = useQueryClient();
  const { token, setToken } = useAdminToken();

  const [inputToken, setInputToken] = useState("");
  const [authError, setAuthError] = useState<"401" | "404" | "network" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const {
    data: leads,
    isLoading: isQueryLoading,
    error: queryError,
    refetch,
  } = useQuery<AdminLeadItem[], ApiError | Error>({
    queryKey: ["adminLeads", token],
    queryFn: async () => {
      if (!token) return [];
      try {
        return await getAdminLeads(token);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          setToken(null);
          setAuthError("401");
          setErrorMessage("Not authorised.");
        }
        throw err;
      }
    },
    enabled: Boolean(token),
    retry: false,
  });

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = inputToken.trim();
    if (!cleanToken) return;

    setIsVerifying(true);
    setAuthError(null);
    setErrorMessage(null);

    try {
      const data = await getAdminLeads(cleanToken);
      queryClient.setQueryData(["adminLeads", cleanToken], data);
      setToken(cleanToken);
    } catch (err: unknown) {
      setToken(null);
      if (err instanceof ApiError) {
        if (err.status === 401) {
          setAuthError("401");
          setErrorMessage("Not authorised.");
        } else if (err.status === 404) {
          setAuthError("404");
          setErrorMessage("Admin access is disabled on this server.");
        } else {
          setAuthError("network");
          setErrorMessage(err.message || "Failed to load leads.");
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

  const handleSignOut = () => {
    setToken(null);
    setInputToken("");
    setAuthError(null);
    setErrorMessage(null);
  };

  const isLoading = isVerifying || isQueryLoading;

  const effectiveError =
    authError ||
    (queryError instanceof ApiError && queryError.status === 401
      ? "401"
      : queryError instanceof ApiError && queryError.status === 404
        ? "404"
        : queryError
          ? "network"
          : null);

  const effectiveErrorMessage =
    errorMessage ||
    (queryError instanceof ApiError && queryError.status === 401
      ? "Not authorised."
      : queryError instanceof ApiError && queryError.status === 404
        ? "Admin access is disabled on this server."
        : queryError instanceof Error
          ? queryError.message
          : null);

  return (
    <main className="studio-grid-bg isolate relative min-h-screen bg-page-bg text-foreground px-4 py-12 md:py-16">
      <StudioBackground showWaves={false} />

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col">
        {/* Top Breadcrumb Nav */}
        <div className="mb-6 flex items-center justify-between border-b border-line pb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            Home
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {token && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-xs font-mono text-muted-foreground hover:text-destructive gap-1.5 h-7 px-2 border border-line bg-surface dark:bg-[#151517] hover:bg-hover dark:hover:bg-[#1f1f23]"
              >
                <LogOut className="size-3.5" />
                Sign Out
              </Button>
            )}
          </div>
        </div>

        {/* Authentication Form if token is not active or lead fetching failed with auth error */}
        {!token || !leads ? (
          <div className="mx-auto w-full max-w-md space-y-6 pt-12">
            <div className="text-center space-y-2">
              <div className="mx-auto size-12 rounded-full border border-line bg-surface dark:bg-[#151517] flex items-center justify-center">
                <KeyRound className="size-6 text-brand-accent" />
              </div>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                Admin Authentication
              </h1>
              <p className="text-sm text-muted-foreground">
                Enter your administrative secret token to review prospective client leads.
              </p>
            </div>

            {effectiveError === "401" && (
              <Alert variant="destructive" className="rounded-xl border-destructive/50 bg-surface dark:bg-[#151517]">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-sm font-semibold text-foreground">Authentication Failed</AlertTitle>
                <AlertDescription className="text-xs font-medium text-muted-foreground">
                  {effectiveErrorMessage || "Not authorised."}
                </AlertDescription>
              </Alert>
            )}

            {effectiveError === "404" && (
              <Alert variant="destructive" className="rounded-xl border-destructive/50 bg-surface dark:bg-[#151517]">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-sm font-semibold text-foreground">Admin Unavailable</AlertTitle>
                <AlertDescription className="text-xs font-medium text-muted-foreground">
                  {effectiveErrorMessage || "Admin access is disabled on this server."}
                </AlertDescription>
              </Alert>
            )}

            {effectiveError === "network" && (
              <Alert variant="destructive" className="rounded-xl border-destructive/50 bg-surface dark:bg-[#151517]">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-sm font-semibold text-foreground">Request Failed</AlertTitle>
                <AlertDescription className="text-xs font-medium text-muted-foreground">
                  {effectiveErrorMessage || "Failed to load leads."}
                </AlertDescription>
              </Alert>
            )}

            <form
              onSubmit={handleLoginSubmit}
              className="rounded-2xl border border-line bg-surface dark:bg-[#151517] p-6 shadow-xl space-y-4"
            >
              <div className="space-y-2">
                <label
                  htmlFor="admin-token"
                  className="block text-xs font-mono uppercase tracking-wider text-muted-foreground"
                >
                  Admin Secret Token
                </label>
                <Input
                  id="admin-token"
                  type="password"
                  value={inputToken}
                  onChange={(e) => setInputToken(e.target.value)}
                  placeholder="Enter token..."
                  disabled={isLoading}
                  autoComplete="off"
                  className="border-line bg-surface-input dark:bg-[#161618] font-mono text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || !inputToken.trim()}
                className="w-full bg-brand-accent text-brand-accent-ink hover:bg-brand-accent-hover font-semibold text-xs h-9 gap-2 transition-colors"
              >
                {isLoading && <RefreshCw className="size-3.5 animate-spin" />}
                {isLoading ? "Verifying..." : "View Leads"}
              </Button>
            </form>
          </div>
        ) : (
          /* Authenticated Leads Review Interface */
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Users className="size-5 text-brand-accent" />
                  <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
                    Client Leads
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground">
                  Prospective customer inquiries submitted through design contact requests.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-line bg-surface-input dark:bg-[#161618] px-3 py-1 text-xs font-mono text-muted-foreground">
                  {leads.length} lead{leads.length === 1 ? "" : "s"}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refetch()}
                  disabled={isLoading}
                  className="text-xs font-mono gap-1.5 h-8 border-line bg-surface dark:bg-[#151517] hover:bg-hover dark:hover:bg-[#1f1f23]"
                >
                  <RefreshCw className={`size-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
            </div>

            {leads.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-surface/50 dark:bg-[#151517]/50 p-12 text-center space-y-2">
                <p className="text-sm font-medium text-foreground">No leads received yet</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  When visitors submit inquiries using the &ldquo;Contact our team&rdquo; dialog, they will appear here.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-line bg-surface dark:bg-[#151517] shadow-xl overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="border-line hover:bg-transparent">
                      <TableHead className="font-mono text-xs uppercase text-muted-foreground w-28">ID</TableHead>
                      <TableHead className="font-mono text-xs uppercase text-muted-foreground w-36">Created</TableHead>
                      <TableHead className="font-mono text-xs uppercase text-muted-foreground w-40">Name</TableHead>
                      <TableHead className="font-mono text-xs uppercase text-muted-foreground w-48">Email</TableHead>
                      <TableHead className="font-mono text-xs uppercase text-muted-foreground">Note</TableHead>
                      <TableHead className="font-mono text-xs uppercase text-muted-foreground text-right w-32">Design</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leads.map((lead) => (
                      <TableRow key={lead.id} className="border-line hover:bg-hover dark:hover:bg-[#161618]">
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {lead.id.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(lead.created_at).toLocaleString(undefined, {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">
                          {lead.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {lead.email}
                        </TableCell>
                        <TableCell className="text-xs text-foreground/90 whitespace-pre-wrap break-words max-w-md">
                          {lead.note || <span className="text-muted-foreground/60 italic">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            href={`/admin/designs/${encodeURIComponent(lead.design_id)}/${encodeURIComponent(lead.version_no)}`}
                            className="inline-flex items-center text-xs font-mono font-semibold text-rust dark:text-brand-accent hover:underline"
                          >
                            v{lead.version_no} ({lead.design_id.slice(0, 6)})
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
