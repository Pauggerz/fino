// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // 1. Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { imageBase64 } = await req.json()

    // 2. Grab the Google Secret securely
    // @ts-ignore
    const googleKeyJson = Deno.env.get('GOOGLE_APPLICATION_CREDENTIALS_JSON')
    if (!googleKeyJson) {
      throw new Error("Missing Google Credentials secret.")
    }

    const credentials = JSON.parse(googleKeyJson)
    // @ts-ignore
    const apiKey = credentials.api_key || Deno.env.get('GOOGLE_VISION_API_KEY');

    // 3. Make the REST call to Google Vision
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{
          image: { content: imageBase64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
        }]
      })
    })

    const visionData = await response.json()
    const rawText = visionData.responses[0]?.fullTextAnnotation?.text || ''

    // 4. Return the parsed text
    const parsedData = {
      rawText: rawText,
      // Add any specific regex extraction here (merchant, amount)
    }

    return new Response(JSON.stringify(parsedData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    // @ts-ignore
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})