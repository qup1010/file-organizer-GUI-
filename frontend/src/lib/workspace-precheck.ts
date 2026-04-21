import { getSessionStageView } from "@/lib/session-view-model";
import type { SessionStage } from "@/types/session";

export function canRunPrecheck(
  stage: SessionStage,
  readiness: { can_precheck?: boolean } | null | undefined,
  isPlanSyncing: boolean,
): boolean {
  return getSessionStageView(stage).isAwaitingPrecheck && Boolean(readiness?.can_precheck) && !isPlanSyncing;
}
