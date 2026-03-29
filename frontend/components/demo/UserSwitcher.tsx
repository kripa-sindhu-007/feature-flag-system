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
    <div className="flex flex-wrap items-end gap-4 rounded-xl border border-border/50 bg-card/50 p-4 backdrop-blur-sm">
      <div className="space-y-2">
        <Label className="text-[10px] font-bold uppercase tracking-widest">Select User</Label>
        <Select
          value={isPreset ? currentUser : "custom"}
          onValueChange={(val) => {
            if (val && val !== "custom") onUserChange(val);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Select user" />
          </SelectTrigger>
          <SelectContent>
            {PRESET_USERS.map((user) => (
              <SelectItem key={user} value={user}>
                {user}
              </SelectItem>
            ))}
            <SelectItem value="custom">Custom...</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!isPreset && (
        <div className="space-y-2">
          <Label className="text-[10px] font-bold uppercase tracking-widest">Custom User ID</Label>
          <Input
            value={currentUser}
            onChange={(e) => onUserChange(e.target.value)}
            placeholder="custom-user-id"
            className="w-48 font-mono transition-all focus:anime-border-glow"
          />
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
        <User className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-sm font-semibold text-primary">{currentUser}</span>
      </div>
    </div>
  );
}
