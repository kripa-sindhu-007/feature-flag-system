"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

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
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter user ID..."
          className="flex-1 font-mono transition-all focus:anime-border-glow"
        />
        <Button type="button" variant="secondary" onClick={addUser} className="font-semibold uppercase tracking-wider">
          Add
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <AnimatePresence>
          {users.map((user) => (
            <motion.span
              key={user}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              <Badge variant="secondary" className="gap-1 pr-1 font-mono text-xs">
                {user}
                <button
                  type="button"
                  onClick={() => removeUser(user)}
                  className="ml-1 rounded-full p-0.5 transition-colors hover:bg-destructive/20 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
