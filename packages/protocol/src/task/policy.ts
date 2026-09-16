export interface TaskPolicy {
  filesystem?: {
    write?: string[];
  };
  git?: { commit?: boolean };
  deployment?: { allowed?: boolean };
  network?: { allowed?: boolean };
}
