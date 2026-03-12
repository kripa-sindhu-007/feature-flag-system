import { Flag, CreateFlagInput, UpdateFlagInput } from "@/types/flag";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const ADMIN_API_KEY =
  process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-secret-key";

class FlagAPI {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        "X-Admin-API-Key": this.apiKey,
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

  async listFlags(): Promise<Flag[]> {
    return this.request<Flag[]>("/api/admin/flags");
  }

  async getFlag(id: string): Promise<Flag> {
    return this.request<Flag>(`/api/admin/flags/${id}`);
  }

  async createFlag(input: CreateFlagInput): Promise<Flag> {
    return this.request<Flag>("/api/admin/flags", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  async updateFlag(id: string, input: UpdateFlagInput): Promise<Flag> {
    return this.request<Flag>(`/api/admin/flags/${id}`, {
      method: "PUT",
      body: JSON.stringify(input),
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

export const flagAPI = new FlagAPI(API_URL, ADMIN_API_KEY);
