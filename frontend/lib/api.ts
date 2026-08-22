import {
  Flag,
  CreateFlagInput,
  UpdateFlagInput,
  FlagsResponse,
  FlagEvent,
} from "@/types/flag";

// Admin mutations go through same-origin Next route handlers under
// /api/admin/** (see app/api/admin/**). Those run server-side and inject the
// admin API key from the non-public ADMIN_API_KEY env, so the key never reaches
// this client bundle. baseUrl is empty => relative, same-origin fetches.
class FlagAPI {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(error.message || `Request failed: ${res.status}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  async listFlags(): Promise<FlagsResponse> {
    return this.request<FlagsResponse>("/api/admin/flags");
  }

  async getFlag(id: string): Promise<Flag> {
    return this.request<Flag>(`/api/admin/flags/${id}`);
  }

  async getFlagHistory(id: string): Promise<FlagEvent[]> {
    const res = await this.request<{ events: FlagEvent[] }>(
      `/api/admin/flags/${id}/events`
    );
    return res.events;
  }

  async createFlag(input: CreateFlagInput): Promise<Flag> {
    return this.request<Flag>("/api/admin/flags", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateFlag(
    id: string,
    input: UpdateFlagInput,
    expectedVersion?: number
  ): Promise<Flag> {
    // Send If-Match for optimistic concurrency — the server returns 409 if the
    // flag changed since we loaded it.
    const headers: Record<string, string> =
      expectedVersion != null ? { "If-Match": `"${expectedVersion}"` } : {};
    return this.request<Flag>(`/api/admin/flags/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
      headers,
    });
  }

  async deleteFlag(id: string): Promise<void> {
    return this.request<void>(`/api/admin/flags/${id}`, {
      method: "DELETE",
    });
  }

  async toggleFlag(id: string): Promise<Flag> {
    return this.request<Flag>(`/api/admin/flags/${id}/toggle`, {
      method: "PATCH",
    });
  }
}

export const flagAPI = new FlagAPI("");
