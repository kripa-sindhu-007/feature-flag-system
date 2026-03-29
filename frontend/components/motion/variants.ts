import { type Variants } from "framer-motion";

// Page-level fade + gentle slide up
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

// Staggered container for lists
export const staggerContainer: Variants = {
  animate: {
    transition: { staggerChildren: 0.06 },
  },
};

// Individual stagger child
export const staggerItem: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, x: -16 },
};

// Card hover effect - anime-style gentle lift with glow feel
export const scaleOnHover: Variants = {
  rest: { scale: 1, y: 0 },
  hover: { scale: 1.015, y: -2 },
  tap: { scale: 0.985 },
};

// Feature reveal (demo page)
export const featureReveal: Variants = {
  initial: { opacity: 0, y: 12, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.98 },
};

// Gentle fade in for decorative elements
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

// Shared transition configs
export const springTransition = {
  type: "spring" as const,
  stiffness: 400,
  damping: 28,
};

export const defaultTransition = {
  duration: 0.35,
  ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
};

export const gentleSpring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 24,
};
