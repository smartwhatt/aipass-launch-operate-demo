"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";

const TABS = [
  { href: "/admin/demo", label: "สถานการณ์และคู่มือ" },
  { href: "/admin/dashboard", label: "แดชบอร์ด" },
  { href: "/admin/evaluations", label: "การประเมิน" },
  { href: "/admin/releases", label: "รุ่นที่เผยแพร่" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="tabs" aria-label="เมนูผู้ดูแลระบบ">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          prefetch={false}
          aria-current={pathname === tab.href ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
      <Link
        href="/admin/traces/DEMO-R042"
        prefetch={false}
        aria-current={pathname.startsWith("/admin/traces") ? "page" : undefined}
      >
        ร่องรอยตัวอย่าง
      </Link>
    </nav>
  );
}
