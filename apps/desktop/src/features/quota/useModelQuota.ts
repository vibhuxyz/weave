export interface QuotaLimit {
  label: string;
  percentRemaining: number;
  refreshesInText: string;
}

export interface ModelQuota {
  groupName: string;
  limits: QuotaLimit[];
}

export function useModelQuota(modelId?: string): ModelQuota | null {
  // Mock logic based on the requested screenshot
  if (!modelId) return null;
  
  if (modelId.toLowerCase().includes("gemini")) {
    return {
      groupName: "GEMINI MODELS",
      limits: [
        {
          label: "One Hour Limit Remaining",
          percentRemaining: 45.2,
          refreshesInText: "Refreshes in 0h 44m",
        },
        {
          label: "Weekly Limit Remaining",
          percentRemaining: 94.93,
          refreshesInText: "Refreshes in 128h 44m",
        }
      ]
    };
  }
  
  if (modelId.toLowerCase().includes("claude code")) {
    return {
      groupName: "CLAUDE CODE v2.1.261",
      limits: [
        {
          label: "Monthly Spend Limit",
          percentRemaining: 0,
          refreshesInText: "You've hit your monthly spend limit. Session limit resets 4pm (Asia/Calcutta). Run /usage-credits to adjust.",
        }
      ]
    };
  }

  if (modelId.toLowerCase().includes("claude") || modelId.toLowerCase().includes("gpt")) {
    return {
      groupName: "CLAUDE AND GPT MODELS",
      limits: [
        {
          label: "One Hour Limit Remaining",
          percentRemaining: 100,
          refreshesInText: "Quota available",
        },
        {
          label: "Weekly Limit Remaining",
          percentRemaining: 65.71,
          refreshesInText: "Refreshes in 121h 27m",
        }
      ]
    };
  }

  // Fallback for Antigravity or any other model
  const name = modelId.toUpperCase().replace(/[-_]/g, " ");
  return {
    groupName: `${name} MODELS`,
    limits: [
      {
        label: "One Hour Limit Remaining",
        percentRemaining: 88.84,
        refreshesInText: "Refreshes in 4h 44m",
      },
      {
        label: "Weekly Limit Remaining",
        percentRemaining: 72.3,
        refreshesInText: "Refreshes in 118h 12m",
      }
    ]
  };
}
