"use client";

import { useEffect, useState } from "react";
import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { paginateResume } from "./paginate";

export function usePagination(
  doc: ResumeDoc | null,
  tokens: TemplateTokens | null,
): { pages: ResumeDoc[]; paginating: boolean } {
  const [pages, setPages] = useState<ResumeDoc[]>(doc ? [doc] : []);
  const [paginating, setPaginating] = useState(false);

  useEffect(() => {
    if (!doc || !tokens) {
      setPages([]);
      setPaginating(false);
      return;
    }
    let cancelled = false;
    setPaginating(true);
    const timer = window.setTimeout(() => {
      void paginateResume(doc, tokens)
        .then((result) => {
          if (!cancelled) setPages(result);
        })
        .catch(() => {
          if (!cancelled) setPages([doc]);
        })
        .finally(() => {
          if (!cancelled) setPaginating(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc, tokens]);

  return { pages, paginating };
}
