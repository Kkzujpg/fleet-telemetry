"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../../../lib/session/session-context";
import { ApiError } from "../../../lib/http/api-client";
import { LogoMark } from "../../../components/icons";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-scene">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes login-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-scene { animation: login-rise 0.5s var(--ease-out-expo) both; }
        .login-field {
          width: 100%;
          padding: 11px 13px;
          background: var(--surface-1);
          border: 1px solid var(--border-medium);
          border-radius: var(--radius-sm);
          color: var(--text-primary);
          font-size: 14.5px;
          transition: border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
        }
        .login-field::placeholder { color: var(--text-tertiary); }
        .login-field:hover { border-color: var(--border-strong); }
        .login-field:focus {
          outline: none;
          border-color: var(--accent);
          background: var(--surface-2);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
        .login-submit {
          width: 100%;
          padding: 11px 16px;
          border-radius: var(--radius-sm);
          border: none;
          background: var(--accent);
          color: oklch(15% 0.012 265);
          font-size: 14.5px;
          font-weight: 600;
          transition: background 0.15s ease, transform 0.1s ease;
        }
        .login-submit:hover:not(:disabled) { background: var(--accent-strong); }
        .login-submit:active:not(:disabled) { transform: scale(0.98); }
        .login-submit:disabled { opacity: 0.55; cursor: not-allowed; }
      `,
        }}
      />

      <form
        onSubmit={handleSubmit}
        style={{
          width: 360,
          display: "flex",
          flexDirection: "column",
          gap: 20,
          padding: 32,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 4 }}>
          <LogoMark width={52} height={52} />
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: 18, fontWeight: 650, margin: 0, letterSpacing: "-0.01em" }}>Fleet Telemetry</h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
              Accede a la consola de flota en tiempo real
            </p>
          </div>
        </div>

        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Email</span>
          <input
            className="login-field"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="nombre@empresa.com"
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Contraseña</span>
          <input
            className="login-field"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: "9px 12px",
              borderRadius: "var(--radius-sm)",
              background: "var(--status-critical-soft)",
              color: "var(--status-critical)",
              fontSize: 13,
            }}
          >
            {error}
          </p>
        )}

        <button type="submit" className="login-submit" disabled={submitting}>
          {submitting ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
