"use client";

import { useEffect, useRef, useState } from "react";
import { Slider } from "@/components/ui/slider";

interface RolloutSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function RolloutSlider({ value, onChange }: RolloutSliderProps) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (val: number | readonly number[]) => {
    const newVal = Array.isArray(val) ? val[0] : (val as number);
    setLocalValue(newVal);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onChange(newVal), 200);
  };

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/40 px-4 py-3">
      <Slider
        value={[localValue]}
        onValueChange={handleChange}
        max={100}
        min={0}
        step={1}
        className="flex-1"
        aria-label="Rollout percentage"
      />
      <span className="w-14 shrink-0 rounded-md border border-border bg-card py-1 text-center font-mono text-sm font-medium tabular-nums text-foreground">
        {localValue}%
      </span>
    </div>
  );
}
