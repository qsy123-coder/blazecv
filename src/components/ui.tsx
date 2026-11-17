"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "default" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "border-transparent bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950",
  default:
    "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100",
  ghost:
    "border-transparent bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700",
  danger:
    "border-red-200 bg-white text-red-600 hover:bg-red-50 active:bg-red-100",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2 text-xs",
  md: "h-9 px-3 text-[13px]",
  icon: "h-8 w-8 p-0",
};

export function Button({
  variant = "default",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-1.5 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[10px] text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="text" className={cn("field-input", className)} {...props} />;
}

export function TextArea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("field-textarea", className)} {...props} />;
}

export function Card({
  title,
  action,
  children,
  bodyClassName,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
        <span className="text-[12px] font-semibold text-slate-600">{title}</span>
        {action}
      </div>
      <div className={cn("p-3", bodyClassName)}>{children}</div>
    </div>
  );
}
