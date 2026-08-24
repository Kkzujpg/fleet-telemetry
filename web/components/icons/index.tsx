// Set de íconos basado en trazo, grilla de 24px, stroke 1.75, uniones
// redondeadas - dibujado una vez acá para que toda superficie use el mismo
// lenguaje de glifos consistente en vez de símbolos unicode o una fuente de
// íconos de terceros.
import type { SVGProps } from "react";

function base(props: SVGProps<SVGSVGElement>) {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    ...props,
  };
}

export function AlertTriangleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M10.6 3.5 2.9 17a1.8 1.8 0 0 0 1.55 2.7h15.1A1.8 1.8 0 0 0 21.1 17L13.4 3.5a1.8 1.8 0 0 0-2.8 0Z" />
      <path d="M12 9.5v4.2" />
      <circle cx="12" cy="17" r="0.15" fill="currentColor" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

export function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
    </svg>
  );
}

export function ChevronRightIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M9 5.5 16 12l-7 6.5" />
    </svg>
  );
}

export function GaugeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M4 15.5a8 8 0 1 1 16 0" />
      <path d="M12 15.5 16 9" />
      <path d="M12 15.5h.01" />
    </svg>
  );
}

export function FuelIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M5 20.5V6a1.5 1.5 0 0 1 1.5-1.5h5A1.5 1.5 0 0 1 13 6v14.5" />
      <path d="M4 20.5h10" />
      <path d="M13 9.5l2.8 2.3v5.2a1.3 1.3 0 0 0 2.6 0V10a2 2 0 0 0-.6-1.4L15.5 6.2" />
      <path d="M7 8.5h4" />
    </svg>
  );
}

export function ThermometerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <path d="M12 14.76V4.5a2 2 0 1 0-4 0v10.26a4 4 0 1 0 4 0Z" />
    </svg>
  );
}

export function RouteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="5.5" cy="6" r="2" />
      <circle cx="18.5" cy="18" r="2" />
      <path d="M5.5 8v3a4 4 0 0 0 4 4h5a4 4 0 0 1 4 4" />
    </svg>
  );
}

export function ClockIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  );
}

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg width={22} height={22} viewBox="0 0 52 52" fill="none" aria-hidden {...props}>
      <rect width="52" height="52" rx="14" fill="var(--accent)" />
      <path
        d="M9 27h6.5l3.5-9 6 18 4-13.5 3 4.5H43"
        stroke="oklch(15% 0.012 265)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle cx="43" cy="27" r="3.2" fill="oklch(15% 0.012 265)" />
    </svg>
  );
}
