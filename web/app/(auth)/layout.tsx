export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        background:
          "radial-gradient(60% 50% at 50% 0%, oklch(24% 0.02 275 / 0.5) 0%, transparent 60%), var(--bg)",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(60% 55% at 50% 30%, black 0%, transparent 75%)",
          WebkitMaskImage: "radial-gradient(60% 55% at 50% 30%, black 0%, transparent 75%)",
          opacity: 0.6,
        }}
      />
      <div style={{ position: "relative" }}>{children}</div>
    </div>
  );
}
