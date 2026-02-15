import { useState } from 'react';

import { motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';

import { Button } from '../ui/button';

export const LiveThought = (): JSX.Element => {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2"
      aria-live="polite"
    >
      <Sparkles className="size-4 text-muted-foreground" />

      <p className="flex-1 text-[13px] text-muted-foreground">
        3 overdue items and nothing planned for today yet.
      </p>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-[11px] text-muted-foreground"
      >
        Plan my day
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="text-muted-foreground"
        aria-label="Dismiss live thought"
        onClick={() => setIsVisible(false)}
      >
        <X />
      </Button>
    </motion.section>
  );
};
