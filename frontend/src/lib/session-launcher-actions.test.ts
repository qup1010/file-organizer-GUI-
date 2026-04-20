import { describe, expect, it, vi } from "vitest";

import { createSessionAndStartScan, startFreshSession } from "./session-launcher-actions";

describe("session-launcher-actions", () => {
  it("does not abandon a completed session before restarting", async () => {
    const api = {
      abandonSession: vi.fn(),
      createSession: vi.fn().mockResolvedValue({
        mode: "created",
        session_id: "session-2",
        restorable_session: null,
        session_snapshot: null,
      }),
      scanSession: vi.fn().mockResolvedValue({}),
    };

    await startFreshSession(
      api,
      "session-1",
      "D:/data",
      {
        template_id: "general_downloads",
        organize_mode: "initial",
        task_type: "organize_full_directory",
        destination_index_depth: 2,
        language: "zh",
        density: "normal",
        prefix_style: "none",
        caution_level: "balanced",
        note: "",
      },
      "completed",
    );

    expect(api.abandonSession).not.toHaveBeenCalled();
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(api.scanSession).toHaveBeenCalledWith("session-2");
  });

  it("abandons a non-completed session before restarting", async () => {
    const api = {
      abandonSession: vi.fn().mockResolvedValue({}),
      createSession: vi.fn().mockResolvedValue({
        mode: "created",
        session_id: "session-2",
        restorable_session: null,
        session_snapshot: null,
      }),
      scanSession: vi.fn().mockResolvedValue({}),
    };

    await startFreshSession(
      api,
      "session-1",
      "D:/data",
      {
        template_id: "general_downloads",
        organize_mode: "initial",
        task_type: "organize_full_directory",
        destination_index_depth: 2,
        language: "zh",
        density: "normal",
        prefix_style: "none",
        caution_level: "balanced",
        note: "",
      },
      "planning",
    );

    expect(api.abandonSession).toHaveBeenCalledWith("session-1");
    expect(api.createSession).toHaveBeenCalledTimes(1);
    expect(api.scanSession).toHaveBeenCalledWith("session-2");
  });

  it("passes task_type through when creating a new session", async () => {
    const api = {
      createSession: vi.fn().mockResolvedValue({
        mode: "created",
        session_id: "session-2",
        restorable_session: null,
        session_snapshot: null,
      }),
      scanSession: vi.fn().mockResolvedValue({}),
    };

    await createSessionAndStartScan(
      api,
      "D:/data",
      false,
      {
        template_id: "general_downloads",
        organize_mode: "incremental",
        task_type: "organize_into_existing",
        destination_index_depth: 2,
        language: "zh",
        density: "normal",
        prefix_style: "none",
        caution_level: "balanced",
        note: "",
      },
    );

    expect(api.createSession).toHaveBeenCalledWith(
      "D:/data",
      false,
      expect.objectContaining({
        task_type: "organize_into_existing",
        organize_mode: "incremental",
      }),
    );
  });
});
