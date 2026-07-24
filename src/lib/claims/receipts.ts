import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

export type ReceiptAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type MergeResult = {
  /** Claim PDF with every supported receipt appended as extra pages. */
  pdf: Buffer;
  /** Receipts that were folded into the PDF. */
  appended: ReceiptAttachment[];
  /** Formats pdf-lib cannot embed (HEIC, WebP…) — sent as separate files. */
  unsupported: ReceiptAttachment[];
};

type ReceiptKind = "pdf" | "jpg" | "png" | "unsupported";

const PAGE_WIDTH = 612; // LETTER at 72 dpi
const PAGE_HEIGHT = 792;
const MARGIN = 36;
const CAPTION_HEIGHT = 24;

function startsWith(buf: Buffer, bytes: number[]): boolean {
  if (buf.length < bytes.length) return false;
  return bytes.every((b, i) => buf[i] === b);
}

/**
 * Sniff the real format rather than trusting the browser-provided MIME type,
 * which is frequently empty or wrong for files coming off a phone.
 */
function detectKind(receipt: ReceiptAttachment): ReceiptKind {
  const buf = receipt.content;
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47])) return "png";

  const type = (receipt.contentType ?? "").toLowerCase();
  if (type === "application/pdf") return "pdf";
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/png") return "png";
  return "unsupported";
}

export async function appendReceiptsToClaimPdf(
  claimPdf: Buffer,
  receipts: ReceiptAttachment[],
): Promise<MergeResult> {
  const appended: ReceiptAttachment[] = [];
  const unsupported: ReceiptAttachment[] = [];

  if (receipts.length === 0) {
    return { pdf: claimPdf, appended, unsupported };
  }

  const doc = await PDFDocument.load(claimPdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (const [index, receipt] of receipts.entries()) {
    const label = `Receipt ${index + 1} of ${receipts.length} — ${receipt.filename}`;
    const kind = detectKind(receipt);

    try {
      if (kind === "pdf") {
        const source = await PDFDocument.load(receipt.content, {
          ignoreEncryption: true,
        });
        const pages = await doc.copyPages(source, source.getPageIndices());
        if (pages.length === 0) throw new Error("PDF contained no pages");
        for (const page of pages) {
          doc.addPage(page);
          drawFooterLabel(page, label, font);
        }
      } else if (kind === "jpg" || kind === "png") {
        const image =
          kind === "jpg"
            ? await doc.embedJpg(receipt.content)
            : await doc.embedPng(receipt.content);

        const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        const availableWidth = PAGE_WIDTH - MARGIN * 2;
        const availableHeight = PAGE_HEIGHT - MARGIN * 2 - CAPTION_HEIGHT;
        const scale = Math.min(
          availableWidth / image.width,
          availableHeight / image.height,
        );
        const width = image.width * scale;
        const height = image.height * scale;

        page.drawText(truncate(label, 92), {
          x: MARGIN,
          y: PAGE_HEIGHT - MARGIN,
          size: 9,
          font,
          color: rgb(0.42, 0.44, 0.4),
        });
        page.drawImage(image, {
          x: (PAGE_WIDTH - width) / 2,
          y: MARGIN + (availableHeight - height) / 2,
          width,
          height,
        });
      } else {
        unsupported.push(receipt);
        continue;
      }
      appended.push(receipt);
    } catch {
      // A corrupt or password-protected file must never lose the receipt or
      // block the claim — send it alongside the PDF instead.
      unsupported.push(receipt);
    }
  }

  const bytes = await doc.save();
  return { pdf: Buffer.from(bytes), appended, unsupported };
}

/** Copied pages already have content, so label them in the bottom margin. */
function drawFooterLabel(page: PDFPage, text: string, font: PDFFont) {
  page.drawText(truncate(text, 92), {
    x: MARGIN,
    y: 14,
    size: 7,
    font,
    color: rgb(0.55, 0.57, 0.53),
  });
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
