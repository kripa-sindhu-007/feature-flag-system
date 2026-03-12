"use client";

import { motion } from "framer-motion";
import { FlagList } from "@/components/flags/FlagList";
import { pageTransition, defaultTransition } from "@/components/motion/variants";

export default function FlagsPage() {
  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      transition={defaultTransition}
    >
      <FlagList />
    </motion.div>
  );
}
