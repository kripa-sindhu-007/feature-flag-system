export interface Flag {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  targeted_users: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateFlagInput {
  key: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  targeted_users: string[];
}

export interface UpdateFlagInput {
  description?: string;
  enabled?: boolean;
  rollout_percentage?: number;
  targeted_users?: string[];
}

export interface FlagsResponse {
  flags: Flag[];
  config_version: number;
}

export interface FlagEvent {
  version: number;
  event_type: "created" | "updated" | "deleted";
  flag_key: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface FlagConfig {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  targeted_users: string[];
  version: number;
}
