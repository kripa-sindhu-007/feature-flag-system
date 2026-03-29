export interface Flag {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  targeted_users: string[];
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

export interface FlagConfig {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rollout_percentage: number;
  targeted_users: string[];
}
