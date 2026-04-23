import React from 'react';
import { motion } from 'motion/react';

export function Skeleton({ className }: { className?: string }) {
  return (
    <motion.div
      animate={{ opacity: [0.5, 1, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
      className={`bg-neutral-200 ${className}`}
    />
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white p-6 border border-neutral-100 space-y-4">
      <div className="flex justify-between items-start">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-10" />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-full" />
    </div>
  );
}
