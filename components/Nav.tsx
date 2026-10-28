'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const items = [
  { href: '/', label: 'อัปโหลดสลิป' },
  { href: '/reconcile', label: 'ตรวจรายการจับคู่' },
  { href: '/dashboard', label: 'แดชบอร์ด' },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="topbar">
      <div className="topbar-in">
        <Link href="/" className="brand">
          <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true">
            <rect width="36" height="36" rx="9" fill="#0f6b5c" />
            <path d="M11 9h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
            <path d="M14 14h8M14 18h8" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
          </svg>
          SlipSatit
        </Link>
        <nav className="nav" aria-label="เมนูหลัก">
          {items.map((i) => (
            <Link key={i.href} href={i.href} aria-current={path === i.href ? 'page' : undefined}>
              {i.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
