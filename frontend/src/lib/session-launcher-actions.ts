import type { ApiClient } from "@/lib/api";
import type { CreateSessionResponse, SessionStage, SessionStrategySelection } from "@/types/session";

export async function startFreshSession(
  api: Pick<ApiClient, "abandonSession" | "createSession">,
  previousSessionId: string,
  targetDir: string,
  strategy: SessionStrategySelection,
  previousStage: SessionStage,
): Promise<CreateSessionResponse> {
  if (previousStage !== "completed") {
    await api.abandonSession(previousSessionId);
  }
  return api.createSession(targetDir, false, strategy);
}
