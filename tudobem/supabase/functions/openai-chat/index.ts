import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 6000;

function cleanText(value: unknown, max = MAX_MESSAGE_CHARS) {
  return String(value ?? "").replace(/\s+$/g, "").slice(0, max);
}

function extractOutputText(data: any) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of data?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (typeof content?.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: { message: "Method not allowed" } }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: "OPENAI_API_KEY is not configured in Supabase secrets." } }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const system = cleanText(body.system, 12000);
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const messages = rawMessages
      .slice(-MAX_MESSAGES)
      .map((message: any) => ({
        role: message?.role === "assistant" ? "assistant" : "user",
        content: cleanText(message?.content),
      }))
      .filter((message: any) => message.content.length > 0);

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: { message: "No message content provided." } }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = Deno.env.get("OPENAI_MODEL") || "gpt-5.5";
    const openaiPayload = {
      model,
      instructions: system,
      input: messages,
      max_output_tokens: 800,
      store: false,
    };

    const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiPayload),
    });

    const data = await openaiResponse.json().catch(() => ({}));
    if (!openaiResponse.ok) {
      const message = data?.error?.message || openaiResponse.statusText;
      return new Response(JSON.stringify({ error: { message } }), {
        status: openaiResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = extractOutputText(data);
    if (!text) {
      return new Response(JSON.stringify({ error: { message: "OpenAI returned an empty response." } }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      reply: text,
      content: [{ type: "text", text }],
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: { message: error instanceof Error ? error.message : "Unexpected error" } }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
