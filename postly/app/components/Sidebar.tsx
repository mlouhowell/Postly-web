"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const nav = [
  {
    label: "Home",
    href: "/feed",
    icon: HomeIcon,
  },
  {
    label: "Create",
    href: "/create",
    icon: CreateIcon,
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[200px] flex-shrink-0 flex flex-col h-full bg-white border-r border-[#E5E5E5]">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Postly-logo.svg" alt="Postly" className="h-7 w-auto" />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors ${
                active
                  ? "bg-black/5 text-[#1A1A1A]"
                  : "text-[#666] hover:bg-black/4 hover:text-[#1A1A1A]"
              }`}
            >
              <Icon active={active} />
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/* ─── Icons ─────────────────────────────────────────────────────────────── */

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M2 7.5L9 2L16 7.5V16H11.5V11H6.5V16H2V7.5Z"
        stroke="currentColor"
        strokeWidth={active ? "1.9" : "1.6"}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CreateIcon({ active }: { active: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M13 2.5L15.5 5L6 14.5L2.5 15.5L3.5 12L13 2.5Z"
        stroke="currentColor"
        strokeWidth={active ? "1.9" : "1.6"}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
