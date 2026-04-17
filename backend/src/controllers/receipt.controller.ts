import { Request, Response } from 'express';
import { parseReceipt as parseReceiptImage } from '../services/receipt.service';

export const parseReceipt = async (req: Request, res: Response) => {
  const { imageBase64, mimeType: _mimeType = 'image/jpeg' } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  // Strip data URI scheme if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  // Reject oversized payloads before paying for the Gemini round-trip. 5MB of
  // decoded image is already well beyond what a receipt needs. Base64 encodes
  // 3 bytes per 4 chars, so a 5MB cap → ~6.67M chars.
  const MAX_BASE64_LENGTH = Math.ceil((5 * 1024 * 1024 * 4) / 3);
  if (base64Data.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({ error: 'image_too_large' });
  }

  let timeoutId: NodeJS.Timeout;
  const timeoutTask = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('parse_timeout')), 5000);
  });

  try {
    const parsedData = await Promise.race([
      parseReceiptImage(base64Data),
      timeoutTask
    ]);
    
    clearTimeout(timeoutId!);
    return res.json(parsedData);
    
  } catch (error: any) {
    clearTimeout(timeoutId!);

    if (error.message === 'parse_timeout') {
      return res.status(408).json({
        error: 'parse_timeout',
        partialData: {
          merchant: { value: null, confidence: 0 },
          amount: { value: null, confidence: 0 },
          date: { value: null, confidence: 0 },
        },
      });
    }

    return res.status(500).json({ error: 'Failed to process receipt image' });
  }
};