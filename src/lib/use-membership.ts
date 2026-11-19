"use client";

import { useCallback, useEffect, useState } from "react";

export interface MembershipState {
  active: boolean;
  plan: string | null;
  expiresAt: string | null;
  loggedIn: boolean;
  /** Whether the membership/payment feature is enabled (PAY_ENABLED=true). */
  payEnabled: boolean;
  loading: boolean;
}

const INITIAL: MembershipState = {
  active: false,
  plan: null,
  expiresAt: null,
  loggedIn: false,
  payEnabled: false,
  loading: true,
};

export function notifyMembershipChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("blazecv:membership-changed"));
}

export function useMembership() {
  const [state, setState] = useState<MembershipState>(INITIAL);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/membership", { cache: "no-store" });
      const data = (await response.json()) as Partial<MembershipState>;
      setState({
        active: Boolean(data.active),
        plan: typeof data.plan === "string" ? data.plan : null,
        expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : null,
        loggedIn: Boolean(data.loggedIn),
        payEnabled: Boolean(data.payEnabled),
        loading: false,
      });
    } catch {
      setState((current) => ({ ...current, loading: false }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener("blazecv:membership-changed", onChange);
    return () => window.removeEventListener("blazecv:membership-changed", onChange);
  }, [refresh]);

  return { ...state, refresh };
}
