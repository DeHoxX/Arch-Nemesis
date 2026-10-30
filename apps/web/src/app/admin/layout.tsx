import type { Metadata } from "next";
import { AdminTokenProvider } from "./context";

/**
 * Server layout for administrative sub-tree (/admin/*).
 *
 * Rules (BUILD_PLAN.md:505 & Stage 6C1):
 * - Admin pages are marked noindex:
 *   Emits <meta name="robots" content="noindex, nofollow"/> via Next.js metadata.
 * - Wraps routes in in-memory AdminTokenProvider so token survives client-side navigation.
 */
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return <AdminTokenProvider>{children}</AdminTokenProvider>;
}

