"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RolloutSlider } from "./RolloutSlider";
import { TargetedUsersInput } from "./TargetedUsersInput";
import { CreateFlagInput, UpdateFlagInput, Flag } from "@/types/flag";

type FlagFormProps =
  | { flag?: undefined; onSubmit: (data: CreateFlagInput) => void; isLoading?: boolean }
  | { flag: Flag; onSubmit: (data: UpdateFlagInput) => void; isLoading?: boolean };

export function FlagForm({ flag, onSubmit, isLoading }: FlagFormProps) {
  const isEdit = !!flag;
  const [key, setKey] = useState(flag?.key || "");
  const [description, setDescription] = useState(flag?.description || "");
  const [enabled, setEnabled] = useState(flag?.enabled || false);
  const [rolloutPercentage, setRolloutPercentage] = useState(
    flag?.rollout_percentage || 0
  );
  const [targetedUsers, setTargetedUsers] = useState<string[]>(
    flag?.targeted_users || []
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const keyRef = useRef<HTMLInputElement>(null);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!isEdit) {
      if (!key) newErrors.key = "Key is required";
      else if (!/^[a-zA-Z0-9-]+$/.test(key))
        newErrors.key = "Use letters, numbers, and hyphens only";
      else if (key.length > 64)
        newErrors.key = "Key must be at most 64 characters";
    }
    if (rolloutPercentage < 0 || rolloutPercentage > 100)
      newErrors.rollout = "Must be between 0 and 100";

    setErrors(newErrors);
    if (newErrors.key) keyRef.current?.focus();
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    if (isEdit) {
      onSubmit({
        description,
        enabled,
        rollout_percentage: rolloutPercentage,
        targeted_users: targetedUsers,
      } as UpdateFlagInput);
    } else {
      onSubmit({
        key,
        description,
        enabled,
        rollout_percentage: rolloutPercentage,
        targeted_users: targetedUsers,
      } as CreateFlagInput);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Key */}
      <div className="space-y-1.5">
        <Label htmlFor="key">
          Flag key {!isEdit && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="key"
          ref={keyRef}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={isEdit}
          placeholder="my-feature-flag"
          className="font-mono"
          aria-invalid={!!errors.key}
          aria-describedby={errors.key ? "key-error" : "key-hint"}
        />
        {errors.key ? (
          <p id="key-error" role="alert" className="text-xs text-destructive">
            {errors.key}
          </p>
        ) : (
          <p id="key-hint" className="text-xs text-muted-foreground">
            {isEdit
              ? "The key is immutable once created."
              : "Stable identifier used by SDKs. Cannot be changed later."}
          </p>
        )}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this flag control?"
          rows={3}
        />
      </div>

      {/* Enabled */}
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
        <div>
          <Label htmlFor="enabled" className="cursor-pointer">
            Enabled
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            When off, the flag evaluates to false for everyone.
          </p>
        </div>
        <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Rollout */}
      <div className="space-y-1.5">
        <Label>Rollout percentage</Label>
        <RolloutSlider value={rolloutPercentage} onChange={setRolloutPercentage} />
        {errors.rollout ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.rollout}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Deterministic per user — increasing the percentage keeps existing
            users in the cohort.
          </p>
        )}
      </div>

      {/* Targeting */}
      <div className="space-y-1.5">
        <Label>Targeted users</Label>
        <TargetedUsersInput users={targetedUsers} onChange={setTargetedUsers} />
        <p className="text-xs text-muted-foreground">
          Always-on for these user IDs, regardless of rollout percentage.
        </p>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving…" : isEdit ? "Save changes" : "Create flag"}
        </Button>
      </div>
    </form>
  );
}
