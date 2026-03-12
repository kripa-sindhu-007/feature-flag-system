import { type Variants } from "framer-motion";

// Page-level fade + slide up
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

// Staggered container for lists (FlagList rows, tag chips, etc.)
export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: 0.05 },
  },
};

// Individual stagger child
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -20 },
};

// Card hover effect
export const scaleOnHover: Variants = {
  rest: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.98 },
};

// Feature reveal (demo page)
export const featureReveal: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
};

// Shared transition configs
export const springTransition = {
  type: "spring" as const,
  stiffness: 500,
  damping: 30,
};

export const defaultTransition = {
  duration: 0.3,
  ease: "easeOut" as const,
};
