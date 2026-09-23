"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Сотрудник", description: "Личный Career Quest" },
  { href: "/demo", label: "Demo Lab", description: "Judge dataset и тестовые профили" },
  { href: "/hr", label: "HR", description: "Только агрегаты" },
  { href: "/trust", label: "AI Trust", description: "Проверка решений" },
] as const;

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="cq-rolebar" aria-label="Переключение демо-роли">
      <div className="cq-rolebar-inner">
        <div className="cq-rolebar-label">
          <span className="cq-rolebar-dot" aria-hidden="true" />
          <span>
            <strong>Демо-доступ</strong>
            <small>данные разделены по роли</small>
          </span>
        </div>
        <div className="cq-rolebar-links">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
                className="cq-rolebar-link"
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                title={item.description}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <span className="cq-rolebar-note">Без рейтингов и зарплатных решений</span>
      </div>
    </nav>
  );
}
