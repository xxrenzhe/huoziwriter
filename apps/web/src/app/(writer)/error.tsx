"use client";

import { useEffect } from "react";
import { WriterRouteErrorState } from "@/components/writer-route-state";

export default function WriterError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <WriterRouteErrorState onRetry={reset} />;
}
