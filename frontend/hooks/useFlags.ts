"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import { flagAPI } from "@/lib/api";
import {
  Flag,
  CreateFlagInput,
  UpdateFlagInput,
  FlagsResponse,
  FlagEvent,
} from "@/types/flag";

export function useFlags(): UseQueryResult<FlagsResponse> {
  return useQuery({
    queryKey: ["flags"],
    queryFn: () => flagAPI.listFlags(),
    // Poll so the config-version heartbeat (TopBar pill, demo staleness) stays
    // live even when the SDK stream is intentionally disconnected.
    refetchInterval: 2500,
  });
}

export function useFlag(id: string, enabled = true): UseQueryResult<Flag> {
  return useQuery({
    queryKey: ["flags", id],
    queryFn: () => flagAPI.getFlag(id),
    enabled: !!id && enabled,
    // The detail view is loaded fresh on navigation and kept current via
    // mutation invalidation; a window-focus refetch during a delete→navigate
    // transition would re-request the just-deleted flag and log a 404.
    refetchOnWindowFocus: false,
  });
}

export function useFlagHistory(
  id: string,
  enabled: boolean
): UseQueryResult<FlagEvent[]> {
  return useQuery({
    queryKey: ["flags", id, "events"],
    queryFn: () => flagAPI.getFlagHistory(id),
    enabled: !!id && enabled,
  });
}

export function useCreateFlag(): UseMutationResult<
  Flag,
  Error,
  CreateFlagInput
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFlagInput) => flagAPI.createFlag(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flags"] });
    },
  });
}

export function useUpdateFlag(): UseMutationResult<
  Flag,
  Error,
  { id: string; input: UpdateFlagInput; expectedVersion?: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input, expectedVersion }) =>
      flagAPI.updateFlag(id, input, expectedVersion),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flags"] });
    },
  });
}

export function useDeleteFlag(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => flagAPI.deleteFlag(id),
    onSuccess: () => {
      // Exact: only refresh the list. A prefix match would also invalidate the
      // deleted flag's detail query (["flags", id]) and re-request a 404.
      queryClient.invalidateQueries({ queryKey: ["flags"], exact: true });
    },
  });
}

export function useToggleFlag(): UseMutationResult<Flag, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => flagAPI.toggleFlag(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["flags"] });
    },
  });
}
