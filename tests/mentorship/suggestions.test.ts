import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MentorSuggestions } from "@/components/mentorship/MentorSuggestions";
import { I18nProvider } from "@/lib/i18n/I18nProvider";
import type { Locale } from "@/lib/i18n/core";
import { loadChallengeDataset } from "../recommendation/test-utils";

const identity = vi.hoisted(() => ({
  workspaceSource: "import" as "import" | "demo",
  session: null as { employeeId: string } | null,
  loading: false,
  openPicker: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/components/identity/IdentityProvider", () => ({
  useIdentity: () => identity,
}));

const dataset = loadChallengeDataset();
const render = (locale: Locale) =>
  renderToStaticMarkup(
    createElement(I18nProvider, {
      initialLocale: locale,
      children: createElement(MentorSuggestions, {
        dataset,
        employeeId: "E0028",
        skillId: "SK_SYSTEM_DESIGN",
      }),
    }),
  );

beforeEach(() => {
  identity.workspaceSource = "import";
  identity.session = null;
  identity.loading = false;
});

describe("compact mentor suggestions", () => {
  it.each([
    [
      "ru",
      "Учиться у коллег",
      "Проектирование систем",
      "Переписка доступна в демо компании.",
      "Выбрать демо-профиль",
    ],
    [
      "kk",
      "Әріптестерден үйрену",
      "Жүйелерді жобалау",
      "Хат алмасу компанияның демосында қолжетімді.",
      "Демо-профильді таңдау",
    ],
    [
      "en",
      "Learn from colleagues",
      "System Design",
      "Messaging is available in the company demo.",
      "Choose a demo profile",
    ],
  ] as const)(
    "renders imported colleagues in %s without creating links that impersonate their IDs",
    (locale, heading, skill, notice, picker) => {
      const html = render(locale);
      expect(html).toContain(heading);
      expect(html).toContain(skill);
      expect(html).toContain(notice);
      expect(html).toContain(picker);
      expect(html.match(/<li\b/g)).toHaveLength(3);
      expect(html).not.toContain('href="/chat');
      expect(html).not.toContain("activity_history");
      expect(html).not.toContain("engagement");
    },
  );

  it("does not show the supplied local colleagues when the demo identity differs", () => {
    identity.workspaceSource = "demo";
    identity.session = { employeeId: "E0001" };
    const html = render("en");
    expect(html).toContain(
      "Choose your demo-company profile to find colleagues.",
    );
    expect(html).not.toContain("<li");
    expect(html).not.toContain('href="/chat');
  });
});
