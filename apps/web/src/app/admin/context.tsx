"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

interface AdminTokenContextValue {
  token: string | null;
  setToken: (token: string | null) => void;
}

const AdminTokenContext = createContext<AdminTokenContextValue | undefined>(undefined);

/**
 * In-memory provider for administrative authentication token.
 *
 * Rules (BUILD_PLAN.md:505 & Stage 6C1):
 * - Kept in React state only.
 * - Never persisted in localStorage, sessionStorage, cookies, or URL search parameters.
 * - Retained in memory across client-side SPA navigations between /admin and /admin/designs/[id]/[n].
 */
export function AdminTokenProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);

  const value = useMemo(
    () => ({
      token,
      setToken,
    }),
    [token]
  );

  return (
    <AdminTokenContext.Provider value={value}>
      {children}
    </AdminTokenContext.Provider>
  );
}

export function useAdminToken(): AdminTokenContextValue {
  const context = useContext(AdminTokenContext);
  if (!context) {
    throw new Error("useAdminToken must be used within an AdminTokenProvider");
  }
  return context;
}

