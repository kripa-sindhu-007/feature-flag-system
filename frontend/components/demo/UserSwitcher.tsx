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

const PRESET_USERS = Array.from({ length: 10 }, (_, i) => `user-${i + 1}`);

interface UserSwitcherProps {
  currentUser: string;
  onUserChange: (userId: string) => void;
}

export function UserSwitcher({ currentUser, onUserChange }: UserSwitcherProps) {
  const isPreset = PRESET_USERS.includes(currentUser);

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-2">
        <Label>Select User</Label>
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
          <Label>Custom User ID</Label>
          <Input
            value={currentUser}
            onChange={(e) => onUserChange(e.target.value)}
            placeholder="custom-user-id"
            className="w-48"
          />
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        Current: <span className="font-mono font-medium">{currentUser}</span>
      </p>
    </div>
  );
}
