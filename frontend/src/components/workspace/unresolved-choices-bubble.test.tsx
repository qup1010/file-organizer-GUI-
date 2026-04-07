import React from "react";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UnresolvedChoicesBubble } from "./unresolved-choices-bubble";

describe("UnresolvedChoicesBubble", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not emit duplicate key warnings when legacy items share the same item_id", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <UnresolvedChoicesBubble
        block={{
          type: "unresolved_choices",
          request_id: "req_legacy",
          summary: "请确认 2 个同名文件",
          status: "pending",
          items: [
            {
              item_id: "new_summary_232.bak",
              display_name: "new_summary_232.bak",
              question: "这是第一份备份，应该放哪里？",
              suggested_folders: ["项目资料", "备份归档"],
            },
            {
              item_id: "new_summary_232.bak",
              display_name: "new_summary_232.bak",
              question: "这是第二份备份，应该放哪里？",
              suggested_folders: ["学习资料", "备份归档"],
            },
          ],
        }}
        drafts={{}}
        warning={null}
        isSubmitting={false}
        onPickFolder={() => {}}
        onPickCustom={() => {}}
        onChangeNote={() => {}}
        onSetAllReview={() => {}}
        onSubmit={() => {}}
      />,
    );

    const duplicateKeyWarnings = errorSpy.mock.calls.filter(([message]) =>
      String(message).includes("Encountered two children with the same key"),
    );
    expect(duplicateKeyWarnings).toHaveLength(0);
  });
});
