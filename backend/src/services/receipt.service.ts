import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize the Gemini client using your environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

/**
 * Parses a receipt image (base64) using Gemini 1.5 Flash.
 * * @param base64Image The base64 string of the receipt image (without the data:image/png;base64, prefix)
 * @param mimeType The mime type of the image (e.g., 'image/jpeg', 'image/png')
 * @returns Parsed JSON object with confidence scores
 */
export async function parseReceipt(base64Image: string, mimeType: string = 'image/jpeg') {
  try {
    // 1. Point to the fast, multimodal Flash model
    const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: {
            // Force the model to output valid, parseable JSON
            responseMimeType: "application/json",
        }
    });

    // 2. Format the image data exactly how the SDK expects it
    const imageParts = [
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      },
    ];

    // 3. The prompt you designed
    const prompt = `Extract from this Philippine GCash/Maya/BDO/BPI receipt:
- merchant: the store or biller name (NOT the wallet provider)
- amount: the total amount paid as a number
- date: the transaction date as a string
- wallet: the payment provider (GCash, Maya, BDO, BPI)

Return ONLY valid JSON in this exact format:
{
  "merchant": { "value": string | null, "confidence": number },
  "amount":   { "value": number | null, "confidence": number },
  "date":     { "value": string | null, "confidence": number },
  "wallet":   { "value": string | null, "confidence": number }
}

Confidence is 0.0–1.0. Use 0.85+ only when you are very certain.
If you cannot read a field clearly, use a lower confidence score.`;

    // 4. Send the image and prompt to Gemini
    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const textOutput = response.text();

    // 5. Parse and return the structured data
    const parsedData = JSON.parse(textOutput);
    return parsedData;

  } catch (error) {
    console.error("Error parsing receipt with Gemini:", error);
    throw new Error("Failed to process receipt image.");
  }
}
