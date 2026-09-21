import { createContext, useContext } from 'react';
import type { RecoveryResults } from '../../types/recovery';
import type { RecoveryAction, RequestOf } from '../../lib/recovery';

export interface BusyInfo {
  label: string;
  // A mutating action cannot be abandoned: the workspace stays open until it reports.
  mutating: boolean;
}

export interface CallOptions {
  mutating?: boolean;
}

// One recovery action runs at a time per workspace. The vault serializes mutations
// anyway; gating in the UI avoids self-inflicted lock contention and lost results.
export interface RecoveryGate {
  busy: BusyInfo | null;
  // An interrupted repair blocks saving and repairing until it is undone; reading and recovering copies still work.
  repairPending: boolean;
  call<A extends RecoveryAction>(
    label: string,
    request: RequestOf<A> & { action: A },
    options?: CallOptions,
  ): Promise<RecoveryResults[A]>;
}

export const RecoveryGateContext = createContext<RecoveryGate | null>(null);

export function useRecoveryGate(): RecoveryGate {
  const gate = useContext(RecoveryGateContext);
  if (!gate) throw new Error('useRecoveryGate must be used inside RecoveryWorkspace');
  return gate;
}
