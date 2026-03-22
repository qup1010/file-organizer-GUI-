import type { ApiClient } from "@/lib/api";
import type { CreateSessionResponse } from "@/types/session";

export async function startFreshSession(
  api: Pick<ApiClient, "abandonSession" | "createSession">,
  previousSessionId: string,
  targetDir: string,
): Promise<CreateSessionResponse> {
  await api.abandonSession(previousSessionId);
  return api.createSession(targetDir, false);
}
