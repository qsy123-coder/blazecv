import type { Metadata } from "next";
import { ResumeLibrary } from "@/components/home/ResumeLibrary";

export const metadata: Metadata = {
  title: "我的简历",
  description: "管理本地与云端简历：打开、复制、删除，或从模板新建一份。",
  robots: { index: false, follow: false },
};

export default function ResumesPage() {
  return <ResumeLibrary />;
}
