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
  });
}

export function useFlag(id: string): UseQueryResult<Flag> {
  return useQuery({
    queryKey: ["flags", id],
    queryFn: () => flagAPI.getFlag(id),
    enabled: !!id,
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
      queryClient.invalidateQueries({ queryKey: ["flags"] });
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
