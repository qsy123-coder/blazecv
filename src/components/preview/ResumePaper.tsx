import type { ResumeDoc, TemplateTokens } from "@/lib/types";
import { SingleLayout } from "./SingleLayout";
import { SidebarLayout } from "./SidebarLayout";
import { TimelineLayout } from "./TimelineLayout";
import { BannerLayout } from "./BannerLayout";
import { DarkSidebarLayout } from "./DarkSidebarLayout";
import { SplitLayout } from "./SplitLayout";
import { EditorialLayout } from "./EditorialLayout";

export function ResumePaper({
  doc,
  tokens,
}: {
  doc: ResumeDoc;
  tokens: TemplateTokens;
}) {
  switch (tokens.layout) {
    case "sidebar":
      return <SidebarLayout doc={doc} tokens={tokens} />;
    case "timeline":
      return <TimelineLayout doc={doc} tokens={tokens} />;
    case "banner":
      return <BannerLayout doc={doc} tokens={tokens} />;
    case "dark-sidebar":
      return <DarkSidebarLayout doc={doc} tokens={tokens} />;
    case "split":
      return <SplitLayout doc={doc} tokens={tokens} />;
    case "editorial":
      return <EditorialLayout doc={doc} tokens={tokens} />;
    default:
      return <SingleLayout doc={doc} tokens={tokens} />;
  }
}
