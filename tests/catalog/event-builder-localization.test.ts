import { describe, expect, it } from "vitest";

import type { Locale } from "@/lib/i18n/core";
import { localizeMessage } from "@/lib/i18n/domain";

const messages = [
  "Unknown catalog event type: workshop-x",
  "Unknown role: Role X",
  "Unknown grade: Principal",
  "Unknown skill: SK_CUSTOM",
  "Self-paced events cannot have scheduled sessions",
  "At least one session must be on or after snapshot date 2026-10-01",
  "Enrollment deadline cannot be before snapshot date 2026-10-01",
  "Enrollment deadline cannot be after first session 2026-10-12",
  "Duplicate event identifier: EV_HR_001",
] as const;

describe("HR Event Builder validation localization", () => {
  it.each(["ru", "kk"] satisfies Locale[])(
    "localizes builder-specific diagnostics in %s and preserves evidence tokens",
    (locale) => {
      for (const message of messages) {
        const localized = localizeMessage(message, locale);
        expect(localized).not.toBe(message);
      }

      expect(localizeMessage(messages[3], locale)).toContain("SK_CUSTOM");
      expect(localizeMessage(messages[5], locale)).toContain("2026-10-01");
      expect(localizeMessage(messages[7], locale)).toContain("2026-10-12");
      expect(localizeMessage(messages[8], locale)).toContain("EV_HR_001");
    },
  );

  it("keeps canonical English diagnostics unchanged", () => {
    for (const message of messages) {
      expect(localizeMessage(message, "en")).toBe(message);
    }
  });
});
