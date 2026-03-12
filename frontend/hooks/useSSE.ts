"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createSSEConnection } from "@/lib/sse";

export function useSSE() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = createSSEConnection({
      onFlagUpdated: () => {
        queryClient.invalidateQueries({ queryKey: ["flags"] });
      },
      onFlagDeleted: () => {
        queryClient.invalidateQueries({ queryKey: ["flags"] });
      },
      onError: () => {
        // EventSource auto-reconnects by default
      },
    });

    return () => {
      eventSource.close();
    };
  }, [queryClient]);
}
