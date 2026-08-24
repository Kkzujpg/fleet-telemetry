import type { Metadata } from "next";
import { SessionProvider } from "../lib/session/SessionProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fleet Telemetry",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        {/*
          THESIS: Fleet Telemetry reads like a precision instrument, not a dashboard
          template — status-first color, real depth and an SF-native type voice
          replace the previous bare, cardless list-and-table default.
          OWN-WORLD: near-black cool ground (oklch ~15% L), system-ui/SF type,
          one indigo accent (oklch 72% 0.17 275), status hues sharing that
          chroma/lightness family, 8/12/18px radii, frosted-glass chrome, real
          offset+blur shadows, drawn SVG vehicle glyphs replacing map dots.
          STORY: an operator opens the dashboard, reads fleet health from the
          map + list at a glance, sees live low-fuel alerts inline, and drills
          into one vehicle for history without losing that context.
          FIRST VIEWPORT: dashboard — translucent top bar; left rail: device
          list with live status; alerts panel docked above the map, not
          buried behind a separate route; right: full-bleed map with
          heading-oriented vehicle glyphs.
          FORM: redesign, brief-pinned world (Apple-esque dark tech, casual).
          No concept-seed roll — no image-gen tool in this session and the
          direction was pinned directly by the user, not left open.
          FINISH: unreviewed and undocumented is unfinished; this build ends
          with the finish review, the verdict, DESIGN.md, and every shipping
          raster carrying its provenance.
        */}
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
