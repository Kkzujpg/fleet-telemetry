"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "../../lib/session/session-context";
import { useOffline } from "../../lib/offline/offline-context";
import { LogoMark } from "../icons";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        position: "relative",
        fontSize: 13.5,
        fontWeight: 550,
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        padding: "6px 2px",
      }}
    >
      {label}
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: -9,
            height: 2,
            borderRadius: "var(--radius-pill)",
            background: "var(--accent)",
          }}
        />
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const { isOnline } = useOffline();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          padding: "0 20px",
          height: 52,
          flexShrink: 0,
          background: "var(--bg-elevated)",
          borderBottom: "1px solid var(--border-subtle)",
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <LogoMark />
          <strong style={{ fontSize: 14.5, fontWeight: 650, letterSpacing: "-0.01em" }}>Fleet Telemetry</strong>
        </div>

        <nav style={{ display: "flex", gap: 24 }}>
          <NavLink href="/" label="Flota" />
          {user?.role === "ADMIN" && <NavLink href="/alerts" label="Alertas" />}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {!isOnline && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                fontWeight: 600,
                color: "var(--status-stale)",
                background: "var(--status-stale-soft)",
                padding: "4px 10px",
                borderRadius: "var(--radius-pill)",
              }}
            >
              <span
                aria-hidden
                style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--status-stale)" }}
              />
              Sin conexión
            </span>
          )}
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{user?.email}</span>
          <button
            type="button"
            onClick={() => logout()}
            style={{
              fontSize: 12.5,
              fontWeight: 550,
              color: "var(--text-secondary)",
              background: "var(--surface-2)",
              border: "1px solid var(--border-medium)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 12px",
            }}
          >
            Salir
          </button>
        </div>
      </header>
      <main style={{ flex: 1, minHeight: 0 }}>{children}</main>
    </div>
  );
}
