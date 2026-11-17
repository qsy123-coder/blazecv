import type { SVGProps } from "react";

export const ICONS = {
  undo: ["M9 14 4 9l5-5", "M4 9h10a6 6 0 0 1 0 12h-3"],
  redo: ["m15 14 5-5-5-5", "M20 9H10a6 6 0 0 0 0 12h3"],
  eye: ["M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  eyeOff: [
    "M3 3l18 18",
    "M10.6 6.2A10.9 10.9 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3.1 3.8",
    "M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 6 10 6a10.6 10.6 0 0 0 4.4-.9",
    "M9.9 9.9a3 3 0 0 0 4.2 4.2",
  ],
  trash: ["M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v5", "M14 11v5"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronUp: ["m6 15 6-6 6 6"],
  plus: ["M12 5v14", "M5 12h14"],
  download: ["M12 3v12", "m7 10 5 5 5-5", "M4 21h16"],
  upload: ["M12 15V3", "m7 8 5-5 5 5", "M4 21h16"],
  printer: ["M6 9V3h12v6", "M6 18H4v-6h16v6h-2", "M6 14h12v7H6z"],
  image: ["M3 5h18v14H3z", "m3 15 5-5 4 4 3-3 6 6", "M15 9h.01"],
  fileText: ["M6 2h8l4 4v16H6z", "M14 2v5h5", "M9 12h6", "M9 16h6"],
  grid: ["M3 3h7v7H3z", "M14 3h7v7h-7z", "M3 14h7v7H3z", "M14 14h7v7h-7z"],
  x: ["M6 6l12 12", "M18 6 6 18"],
  arrowUp: ["M12 19V5", "m6 11 6-6 6 6"],
  arrowDown: ["M12 5v14", "m6 13 6 6 6-6"],
  grip: ["M9 6h.01", "M15 6h.01", "M9 12h.01", "M15 12h.01", "M9 18h.01", "M15 18h.01"],
  check: ["m5 13 4 4L19 7"],
  alert: ["M12 8v5", "M12 16h.01", "M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"],
  refresh: ["M3 12a9 9 0 0 1 15.3-6.4L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15.3 6.4L3 16", "M3 21v-5h5"],
  layers: ["m12 2 9 5-9 5-9-5 9-5Z", "m3 12 9 5 9-5", "m3 17 9 5 9-5"],
  phone: [
    "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z",
  ],
  mail: ["M3 5h18v14H3z", "m3 7 9 6 9-6"],
  pin: ["M12 21s7-6 7-12a7 7 0 1 0-14 0c0 6 7 12 7 12Z", "M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  link: [
    "M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2",
    "M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2",
  ],
  arrowLeft: ["M19 12H5", "m12 19-7-7 7-7"],
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
  cloud: [
    "M17.5 19a4.5 4.5 0 0 0 .9-8.9A6 6 0 0 0 6.2 8.3 4.5 4.5 0 0 0 6.5 19Z",
  ],
  lock: ["M6 10V7a6 6 0 0 1 12 0v3", "M5 10h14v11H5z", "M12 15v2"],
  history: [
    "M3 12a9 9 0 1 0 3-6.7L3 8",
    "M3 3v5h5",
    "M12 7v5l3 2",
  ],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 16,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {ICONS[name].map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}
