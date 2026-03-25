"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({ 
  children, 
  variant = "primary", 
  size = "md", 
  loading, 
  className, 
  disabled,
  ...props 
}: ButtonProps) {
  const variants = {
    primary: "border border-primary/20 bg-primary text-white shadow-[0_1px_2px_rgba(37,45,40,0.14)] hover:bg-primary-dim active:scale-95",
    secondary: "border border-on-surface/8 bg-surface-container-lowest text-on-surface hover:bg-surface-container-low active:scale-95",
    danger: "border border-error/15 bg-error-container/45 text-error hover:bg-error hover:text-white active:scale-95",
    ghost: "bg-transparent text-on-surface hover:bg-on-surface/5 active:scale-95"
  };

  const sizes = {
    sm: "px-4 py-2 text-[12px] rounded-sm",
    md: "px-6 py-2.5 text-[14px] rounded-md",
    lg: "px-10 py-4 text-sm rounded-lg"
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold tracking-[0.01em] transition-colors disabled:pointer-events-none disabled:opacity-50 disabled:grayscale",
        variants[variant],
        sizes[size],
        className
      )}
      {...props as any}
    >
      {loading && (
        <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
}
