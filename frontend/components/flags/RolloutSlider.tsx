"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Slider } from "@/components/ui/slider";

interface RolloutSliderProps {
  value: number;
  onChange: (value: number) => void;
}

export function RolloutSlider({ value, onChange }: RolloutSliderProps) {
  const [localValue, setLocalValue] = useState(value);
  const [showPulse, setShowPulse] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (val: number | readonly number[]) => {
    const newVal = Array.isArray(val) ? val[0] : val;
    setLocalValue(newVal);
    setShowPulse(true);
    setTimeout(() => setShowPulse(false), 300);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onChange(newVal);
    }, 300);
  };

  return (
    <div className="flex items-center gap-4">
      <Slider
        value={[localValue]}
        onValueChange={handleChange}
        max={100}
        min={0}
        step={1}
        className="flex-1"
      />
      <AnimatePresence mode="wait">
        <motion.span
          key={localValue}
          initial={{ opacity: 0.7 }}
          animate={{
            opacity: 1,
            scale: showPulse ? [1, 1.2, 1] : 1,
          }}
          className="min-w-[3rem] text-right text-sm font-medium"
        >
          {localValue}%
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
