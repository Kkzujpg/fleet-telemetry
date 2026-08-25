"use client";

import { useEffect, useState } from "react";
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
  const { user, logout, apiFetch } = useSession();
  const { isOnline } = useOffline();
  const [simLoading, setSimLoading] = useState(false);
  const [simRunning, setSimRunning] = useState(false);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    apiFetch<{ running: boolean }>("/sim/status")
      .then((status) => setSimRunning(status.running))
      .catch(() => {
        // Backend offline al montar - el botón parte en "Iniciar simulación" por defecto.
      });
  }, [user?.role, apiFetch]);

  async function toggleSim() {
    setSimLoading(true);
    try {
      const status = await apiFetch<{ running: boolean }>(simRunning ? "/sim/stop" : "/sim/start", {
        method: "POST",
      });
      setSimRunning(status.running);
    } finally {
      setSimLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)" }}>
      <style jsx>{`
        @media (max-width: 640px) {
          .app-header {
            flex-wrap: wrap;
            height: auto !important;
            padding: 10px 12px !important;
            row-gap: 8px;
            gap: 10px;
          }
          .app-header-brand-label {
            display: none;
          }
          .app-header-user-email {
            display: none;
          }
          .app-header-nav {
            order: 3;
            width: 100%;
          }
          .app-header-actions {
            order: 2;
          }
        }
      `}</style>
      <header
        className="app-header"
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
          <strong className="app-header-brand-label" style={{ fontSize: 14.5, fontWeight: 650, letterSpacing: "-0.01em" }}>
            Fleet Telemetry
          </strong>
        </div>

        <nav className="app-header-nav" style={{ display: "flex", gap: 24 }}>
          <NavLink href="/" label="Flota" />
          {user?.role === "ADMIN" && <NavLink href="/alerts" label="Alertas" />}
        </nav>

        <div
          className="app-header-actions"
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", gap: 14 }}
        >
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
          {user?.role === "ADMIN" && (
            <button
              type="button"
              onClick={toggleSim}
              disabled={simLoading}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "#fff",
                background: simRunning ? "var(--status-offline)" : "var(--status-online)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                padding: "6px 12px",
                opacity: simLoading ? 0.6 : 1,
                cursor: simLoading ? "default" : "pointer",
              }}
            >
              {simLoading
                ? simRunning
                  ? "Deteniendo…"
                  : "Iniciando…"
                : simRunning
                  ? "Detener simulación"
                  : "Iniciar simulación"}
            </button>
          )}
          <span className="app-header-user-email" style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            {user?.email}
          </span>
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
