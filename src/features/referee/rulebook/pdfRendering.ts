/** Browser PDF rendering kept separate from Gemini request orchestration. */
// --- PDF tools ---
let mupdfLibPromise: Promise<typeof import('mupdf')> | null = null;

async function getMupdfLib(): Promise<typeof import('mupdf')> {
  if (!mupdfLibPromise) {
    (globalThis as any).$libmupdf_wasm_Module = { locateFile: () => '/mupdf-wasm.wasm' };
    mupdfLibPromise = import('mupdf');
  }
  return mupdfLibPromise;
}

export async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Render PDF pages so diagrams and symbols remain visible to the model.
export async function convertPdfToImages(pdfInput: File | Blob, scaleFactor = 2, specificPage?: number): Promise<{ data: Blob; name: string }[]> {
  try {
    const mupdf = await getMupdfLib();
    const arrayBuffer = await pdfInput.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const images: { data: Blob; name: string }[] = [];
    let doc: any = null;
    try {
      doc = mupdf.Document.openDocument(data, 'application/pdf');
      const totalPages = doc.countPages();

      console.log(`Rendering PDF visually to JPEG images: total ${totalPages} pages (Scale: ${scaleFactor})...`);

      const startPage = specificPage || 1;
      const endPage = specificPage || totalPages;
      const colorspace = mupdf.ColorSpace.DeviceRGB;

      for (let i = startPage; i <= endPage; i++) {
        try {
          const page = doc.loadPage(i - 1);
          const pixmap = page.toPixmap(mupdf.Matrix.scale(scaleFactor, scaleFactor), colorspace, false, true);
          const jpegBytes = pixmap.asJPEG(scaleFactor >= 5.0 ? 100 : 85);

          const blob = new Blob([jpegBytes], { type: 'image/jpeg' });
          images.push({
            data: blob,
            name: `page_${i}.jpg`
          });
          pixmap.destroy();
          page.destroy();
        } catch (pageErr) {
          console.error(`Error rendering PDF page ${i} to visual image:`, pageErr);
        }
      }
      return images;
    } finally {
      doc?.destroy();
    }
  } catch (err) {
    console.error("Error in convertPdfToImages:", err);
    return [];
  }
}

