// OCR ฝั่งเบราว์เซอร์ด้วย Tesseract.js (ฟรี ไม่เสียค่า API)
// ไฟล์ภาษา (tha, eng) และ wasm จะถูกโหลดจาก CDN ครั้งแรกแล้วแคชในเบราว์เซอร์
import type { Worker } from 'tesseract.js';

let workerPromise: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const w = await createWorker(['tha', 'eng']);
      await w.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      return w;
    })().catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

export async function ocrImage(blob: Blob): Promise<{ text: string; confidence: number }> {
  const w = await getWorker();
  const { data } = await w.recognize(blob);
  return { text: data.text, confidence: Math.round(data.confidence) };
}
