import type { Paragraph as DocxParagraph } from "docx";
import type { ResumeDoc } from "../types";
import { getDocTemplate } from "../templates";
import { downloadBlob, formatRange, safeFileName, splitDetailLines, todayStamp } from "../utils";

const CONTENT_WIDTH_TWIP = 9026;
const GREY = "6B7280";
const INK = "1F2937";

export async function exportWord(doc: ResumeDoc): Promise<void> {
  const { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } =
    await import("docx");

  const primary = (doc.theme.primary?.trim() || getDocTemplate(doc).base.primary)
    .replace("#", "")
    .toUpperCase();

  const children: DocxParagraph[] = [];

  const heading = (text: string) =>
    new Paragraph({
      children: [new TextRun({ text, bold: true, size: 24, color: primary })],
      spacing: { before: 240, after: 100 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB", space: 2 },
      },
    });

  const bullet = (text: string) =>
    new Paragraph({
      text,
      bullet: { level: 0 },
      spacing: { after: 40 },
    });

  children.push(
    new Paragraph({
      children: [new TextRun({ text: doc.basics.name, bold: true, size: 44, color: INK })],
      spacing: { after: 60 },
    }),
  );

  if (doc.basics.jobTitle) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: doc.basics.jobTitle, size: 24, color: primary })],
        spacing: { after: 60 },
      }),
    );
  }

  const contact = [
    doc.basics.phone,
    doc.basics.email,
    doc.basics.city,
    ...doc.basics.links.map((link) =>
      link.label && link.url ? `${link.label}：${link.url}` : link.label || link.url,
    ),
  ]
    .filter(Boolean)
    .join("   |   ");

  if (contact) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: contact, size: 18, color: GREY })],
        spacing: { after: 160 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 12, color: primary, space: 6 },
        },
      }),
    );
  }

  for (const section of doc.sections.filter((item) => item.visible)) {
    children.push(heading(section.title));

    if (section.type === "summary") {
      if (section.content.trim()) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: section.content, size: 20 })],
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 100 },
          }),
        );
      }
      continue;
    }

    if (section.type === "education") {
      for (const item of section.items) {
        children.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_TWIP }],
            children: [
              new TextRun({ text: item.school, bold: true, size: 20 }),
              new TextRun({
                text: [item.degree, item.major].filter(Boolean).join(" · "),
                size: 20,
                color: GREY,
              }),
              new TextRun({
                text: `\t${formatRange(item.start, item.end)}`,
                size: 18,
                color: GREY,
              }),
            ],
            spacing: { before: 80, after: 30 },
          }),
        );
        for (const line of splitDetailLines(item.detail)) {
          children.push(bullet(line));
        }
      }
      continue;
    }

    if (section.type === "experience" || section.type === "projects") {
      for (const item of section.items) {
        children.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH_TWIP }],
            children: [
              new TextRun({ text: item.org, bold: true, size: 20 }),
              new TextRun({ text: item.role ? `  ${item.role}` : "", size: 20, color: GREY }),
              new TextRun({
                text: `\t${formatRange(item.start, item.end)}`,
                size: 18,
                color: GREY,
              }),
            ],
            spacing: { before: 80, after: 30 },
          }),
        );
        if (item.location) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: item.location, size: 18, color: GREY })],
              spacing: { after: 30 },
            }),
          );
        }
        for (const line of item.bullets.filter((value) => value.trim())) {
          children.push(bullet(line));
        }
      }
      continue;
    }

    if (section.type === "skills") {
      for (const item of section.items) {
        const text = [item.name, item.detail].filter(Boolean).join("：");
        if (text) children.push(bullet(text));
      }
      continue;
    }

    if (section.type === "certificates" || section.type === "custom") {
      for (const item of section.items) {
        if (item.text.trim()) children.push(bullet(item.text));
      }
    }
  }

  const document = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Microsoft YaHei", size: 20 },
          paragraph: { spacing: { line: 300 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: { margin: { top: 900, right: 1000, bottom: 900, left: 1000 } },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(document);
  downloadBlob(blob, `${safeFileName(doc.basics.name || doc.title)}-${todayStamp()}.docx`);
}
