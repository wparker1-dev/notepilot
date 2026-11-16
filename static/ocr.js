/* English OCR for NotePilot. Runs locally in the user's browser, never uploads images.
 * Tesseract loads lazily only if an image/scanned page needs OCR.
 */
'use strict';
(function () {
  const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
  const MAX_JOBS = 60;
  let loading;

  function engine() {
    if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
    if (!loading) loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_URL;
      script.async = true;
      script.onload = () => window.Tesseract?.createWorker
        ? resolve(window.Tesseract)
        : reject(new Error('OCR library did not initialize.'));
      script.onerror = () => reject(new Error('OCR library could not load. Check your internet connection.'));
      document.head.append(script);
    }).catch(e => { loading = null; throw e; });
    return loading;
  }

  function createSession(report = () => {}) {
    let workerPromise, jobs = 0, closed = false;
    return {
      async recognize(image, label) {
        if (closed) throw new Error('OCR session has ended.');
        if (++jobs > MAX_JOBS) throw new Error(`This document needs OCR on more than ${MAX_JOBS} pages/images. Split the document into smaller files.`);
        if (!workerPromise) {
          report('Downloading the OCR engine and English language data (first use may take longer)…');
          workerPromise = engine().then(lib => lib.createWorker('eng', 1));
        }
        report(`Reading ${label} with OCR (${jobs}/${MAX_JOBS} maximum)…`);
        const output = await (await workerPromise).recognize(image);
        return String(output?.data?.text || '').replace(/\0/g, ' ').trim();
      },
      async close() {
        closed = true;
        if (workerPromise) {
          try { await (await workerPromise).terminate(); } catch { /* allow original extraction errors through */ }
        }
      }
    };
  }

  async function readableImage(blob, minWidth = 120, minHeight = 75) {
    if (!globalThis.createImageBitmap) return true;
    let image;
    try {
      image = await createImageBitmap(blob);
      return image.width >= minWidth && image.height >= minHeight;
    } catch { return false; }
    finally { image?.close(); }
  }

  async function renderPage(page) {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2.3, Math.sqrt(8_000_000 / (base.width * base.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Your browser cannot create a PDF OCR canvas.');
    try {
      await page.render({ canvasContext: ctx, viewport }).promise;
      return await new Promise((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Could not render page for OCR.')),
        'image/png'
      ));
    } finally {
      canvas.width = canvas.height = 0;
    }
  }

  window.NotePilotOCR = { createSession, readableImage, renderPage, MAX_JOBS };
})();
