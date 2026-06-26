// Client-side PDF text extraction via pdf.js, loaded from a CDN at runtime.
// No npm dependency, no API key, no server round trip. Used to pull text out of
// a dropped resume or a LinkedIn "Save to PDF" profile export before it is fed
// into the existing parse path.

// Imported through new Function so no bundler tries to resolve the remote URL.
const dynamicImport: (url: string) => Promise<Record<string, unknown>> =
  new Function("u", "return import(u)") as (url: string) => Promise<Record<string, unknown>>;

const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.mjs";
const WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";

interface PdfTextItem { str?: string }
interface PdfPage { getTextContent: () => Promise<{ items: PdfTextItem[] }> }
interface PdfDoc { numPages: number; getPage: (n: number) => Promise<PdfPage> }
interface PdfLib {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<PdfDoc> };
}

let libPromise: Promise<PdfLib> | null = null;
async function getPdfjs(): Promise<PdfLib> {
  if (!libPromise) {
    libPromise = (async () => {
      const mod = (await dynamicImport(PDFJS)) as unknown as PdfLib;
      mod.GlobalWorkerOptions.workerSrc = WORKER;
      return mod;
    })();
  }
  return libPromise;
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

// Extract concatenated text from every page. Throws on an unreadable or
// non-PDF file so the caller can show a clean error state.
export async function extractPdfText(file: File): Promise<string> {
  if (!isPdf(file)) throw new Error("Not a PDF file.");
  const pdfjs = await getPdfjs();
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it) => it.str ?? "").join(" ") + "\n";
  }
  const trimmed = text.trim();
  if (!trimmed) throw new Error("No selectable text found in this PDF.");
  return trimmed;
}
