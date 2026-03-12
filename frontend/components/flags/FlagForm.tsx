"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { RolloutSlider } from "./RolloutSlider";
import { TargetedUsersInput } from "./TargetedUsersInput";
import { pageTransition, defaultTransition } from "@/components/motion/variants";
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

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!isEdit) {
      if (!key) newErrors.key = "Key is required";
      else if (!/^[a-zA-Z0-9-]+$/.test(key))
        newErrors.key = "Key must be alphanumeric with hyphens only";
      else if (key.length > 64)
        newErrors.key = "Key must be at most 64 characters";
    }
    if (rolloutPercentage < 0 || rolloutPercentage > 100)
      newErrors.rollout = "Must be between 0 and 100";

    setErrors(newErrors);
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
    <motion.form
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
      onSubmit={handleSubmit}
      className="space-y-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="space-y-2"
      >
        <Label htmlFor="key">Flag Key</Label>
        <Input
          id="key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          disabled={isEdit}
          placeholder="my-feature-flag"
        />
        {errors.key && (
          <p className="text-sm text-destructive">{errors.key}</p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-2"
      >
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this flag control?"
          rows={3}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex items-center gap-3"
      >
        <Label htmlFor="enabled">Enabled</Label>
        <Switch
          id="enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="space-y-2"
      >
        <Label>Rollout Percentage</Label>
        <RolloutSlider value={rolloutPercentage} onChange={setRolloutPercentage} />
        {errors.rollout && (
          <p className="text-sm text-destructive">{errors.rollout}</p>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="space-y-2"
      >
        <Label>Targeted Users</Label>
        <TargetedUsersInput users={targetedUsers} onChange={setTargetedUsers} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Button type="submit" disabled={isLoading}>
          {isLoading ? "Saving..." : isEdit ? "Save Changes" : "Create Flag"}
        </Button>
      </motion.div>
    </motion.form>
  );
}
