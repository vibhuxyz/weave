import { AnimatePresence, motion } from "framer-motion";
import { useModelQuota } from "./useModelQuota";
import { useEffect } from "react";
import { create } from "zustand";

interface QuotaStore {
  isOpen: boolean;
  modelId: string | undefined;
  showQuota: (modelId: string) => void;
  hideQuota: () => void;
}

export const useQuotaStore = create<QuotaStore>((set) => ({
  isOpen: false,
  modelId: undefined,
  showQuota: (modelId) => set({ isOpen: true, modelId }),
  hideQuota: () => set({ isOpen: false }),
}));

function ProgressBar({ label, percentRemaining, refreshesInText }: { label: string, percentRemaining: number, refreshesInText: string }) {
  return (
    <div className="space-y-2 w-full">
      <div className="flex justify-between items-end text-[13px] font-medium text-foreground tracking-wide">
        <span>{label}</span>
      </div>
      <div className="h-3 w-full bg-white/10 rounded-full overflow-hidden flex relative">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentRemaining}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="h-full bg-[#5eead4] rounded-full absolute left-0 top-0"
        />
      </div>
      <div className="flex justify-between text-xs text-[#5eead4]/80 font-mono mt-1 opacity-90 leading-relaxed">
        <span className={percentRemaining === 0 ? "w-full text-red-400" : ""}>
          {percentRemaining > 0 ? `${Math.round(percentRemaining)}% remaining \u00B7 ` : ""}
          {refreshesInText}
        </span>
        {percentRemaining > 0 && (
          <span className="shrink-0 pl-4 text-foreground/50">{percentRemaining.toFixed(2)}%</span>
        )}
      </div>
    </div>
  );
}

export function UsageLimitIsland() {
  const { isOpen, modelId, hideQuota } = useQuotaStore();
  const quota = useModelQuota(modelId);

  // Auto-hide after 6 seconds
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(hideQuota, 6000);
      return () => clearTimeout(timer);
    }
  }, [isOpen, hideQuota]);

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex justify-center pointer-events-none p-4">
      <AnimatePresence>
        {isOpen && quota && (
          <motion.div
            layout
            initial={{ y: -60, opacity: 0, scale: 0.9, filter: "blur(8px)" }}
            animate={{ y: 0, opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={{ y: -60, opacity: 0, scale: 0.9, filter: "blur(8px)" }}
            transition={{ type: "spring", stiffness: 300, damping: 25, mass: 0.8 }}
            className="pointer-events-auto w-[420px] bg-black/70 backdrop-blur-3xl border border-white/10 rounded-[32px] p-6 shadow-[0_40px_80px_rgba(0,0,0,0.6)] flex flex-col gap-6 overflow-hidden cursor-pointer"
            onClick={hideQuota}
          >
            <motion.div layout="position" className="text-xs font-bold text-foreground/50 tracking-[0.2em] uppercase flex items-center gap-2.5">
              <div className="size-2 rounded-full bg-[#5eead4] shadow-[0_0_12px_#5eead4]" />
              {quota.groupName}
            </motion.div>
            
            <div className="flex flex-col gap-5">
              {quota.limits.map((limit, idx) => (
                <ProgressBar key={idx} {...limit} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
