import { Request, Response } from 'express';
import { analyzeReceiptImage } from '../services/receipt.service';

export const parseReceipt = async (req: Request, res: Response) => {
  const { imageBase64, mimeType: _mimeType = 'image/jpeg' } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 is required' });
  }

  // Strip data URI scheme if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  let timeoutId: NodeJS.Timeout;
  const timeoutTask = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('parse_timeout')), 5000);
  });

  try {
    const parsedData = await Promise.race([
      analyzeReceiptImage(base64Data),
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