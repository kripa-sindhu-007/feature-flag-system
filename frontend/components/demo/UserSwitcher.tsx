"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { User } from "lucide-react";

const PRESET_USERS = Array.from({ length: 10 }, (_, i) => `user-${i + 1}`);

interface UserSwitcherProps {
  currentUser: string;
  onUserChange: (userId: string) => void;
}

export function UserSwitcher({ currentUser, onUserChange }: UserSwitcherProps) {
  const isPreset = PRESET_USERS.includes(currentUser);

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
      <div className="space-y-1.5">
        <Label htmlFor="user-select">Evaluate as</Label>
        <Select
          value={isPreset ? currentUser : "custom"}
          onValueChange={(val) => {
            if (val && val !== "custom") onUserChange(val);
          }}
        >
          <SelectTrigger id="user-select" className="w-44">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            {PRESET_USERS.map((user) => (
              <SelectItem key={user} value={user}>
                {user}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom…</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isPreset && (
        <div className="space-y-1.5">
          <Label htmlFor="custom-user">Custom user ID</Label>
          <Input
            id="custom-user"
            value={currentUser}
            onChange={(e) => onUserChange(e.target.value)}
            placeholder="custom-user-id"
            className="w-48 font-mono"
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2">
        <User className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-sm font-medium text-foreground">
          {currentUser}
        </span>
      </div>
    </div>
  );
}
