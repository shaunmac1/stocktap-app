import type { PdfTextItem } from "./venners-audit";

const PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";
const WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

let loading: Promise<any> | null = null;
function loadPdfJs(): Promise<any> {
  if (!loading) {
    loading = import(/* @vite-ignore */ PDFJS).then((lib: any) => {
      lib.GlobalWorkerOptions.workerSrc = WORKER;
      return lib;
    }).catch(err => { loading = null; throw err; });
  }
  return loading;
}

/** Every piece of text in a PDF with its page and position (y measured from the top). */
export async function pdfTextItems(data: ArrayBuffer): Promise<PdfTextItem[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const out: PdfTextItem[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    for (const it of tc.items as Array<{ str?: string; transform?: number[] }>) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      out.push({ p, x: Math.round(it.transform[4] * 10) / 10, y: Math.round((vp.height - it.transform[5]) * 10) / 10, s: it.str });
    }
  }
  return out;
}
