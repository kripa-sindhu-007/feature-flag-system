"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface TargetedUsersInputProps {
  users: string[];
  onChange: (users: string[]) => void;
}

export function TargetedUsersInput({ users, onChange }: TargetedUsersInputProps) {
  const [input, setInput] = useState("");

  const addUser = () => {
    const trimmed = input.trim();
    if (trimmed && !users.includes(trimmed)) {
      onChange([...users, trimmed]);
      setInput("");
    }
  };

  const removeUser = (user: string) => {
    onChange(users.filter((u) => u !== user));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addUser();
    }
  };

  return (
    <div className="space-y-2.5">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter user ID and press Enter…"
          className="flex-1 font-mono"
          aria-label="Add targeted user ID"
        />
        <Button type="button" variant="secondary" onClick={addUser}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
      {users.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {users.map((user) => (
            <span
              key={user}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted py-0.5 pl-2 pr-1 font-mono text-xs text-foreground"
            >
              {user}
              <button
                type="button"
                onClick={() => removeUser(user)}
                aria-label={`Remove ${user}`}
                className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
