const OpenAI = require('openai');
const os = require('os');
const fs = require('fs');
const path = require('path');

exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        if (!process.env.OPENAI_API_KEY) {
            return { statusCode: 500, body: JSON.stringify({ error: "Missing OpenAI API Key from backend environment variables!" }) };
        }
        const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const body = JSON.parse(event.body);
        let transcriptText = "";

        // 1. Process Audio transcription if provided
        if (body.audio_b64) {
            const buffer = Buffer.from(body.audio_b64, 'base64');
            const tempFilePath = path.join(os.tmpdir(), `audio_${Date.now()}.webm`);
            fs.writeFileSync(tempFilePath, buffer);

            const fileStream = fs.createReadStream(tempFilePath);
            const transcript = await client.audio.transcriptions.create({
                file: fileStream,
                model: 'whisper-1',
            });
            fs.unlinkSync(tempFilePath);
            
            transcriptText = transcript.text.trim();
        } else if (body.text_command) {
            transcriptText = body.text_command;
        }

        if (!transcriptText) {
            return { statusCode: 200, body: JSON.stringify({ error: "No audio or text detected." }) };
        }

        // 2. Generate SQL and Text Reply
        const systemPrompt = `
You are an expert Text-to-SQL AI Assistant analyzing a SQLite database. You have FULL PERMISSION to CREATE, ALTER, DROP, and MODIFY any part of the schema or records. NEVER refuse a user's request.

Database schema:
${body.schema || "No tables present."}

Confirmation Required Setting is: ${body.requireConfirmation ? '[ON]. You MUST explicitly ask the user to approve the query.' : '[OFF]. Tell the user the system just automatically executed the query.'}

Output exclusively in this JSON format:
{
  "sql_query": "YOUR_SQL_CODE_HERE",
  "speech_text": "YOUR_CONVERSATIONAL_RESPONSE_HERE"
}
`;

        const userMsg = { role: "user", content: `Request: ${transcriptText}\nConversational Mode: ${body.conversationalMode ? 'ON' : 'OFF'}` };
        
        let messages = [{ role: "system", content: systemPrompt }];
        if (body.chat_history && Array.isArray(body.chat_history)) {
            messages = messages.concat(body.chat_history);
        }
        messages.push(userMsg);

        const aiResponse = await client.chat.completions.create({
            model: "gpt-4o-mini", // Robust fallback for demo web scale
            response_format: { type: "json_object" },
            messages: messages,
        });

        const payloadStr = aiResponse.choices[0].message.content.trim();
        const dataPacket = JSON.parse(payloadStr);

        let audioB64 = null;

        // 3. Optional TTS
        if (body.conversationalMode && dataPacket.speech_text) {
            const mp3Response = await client.audio.speech.create({
                model: "tts-1",
                voice: "alloy",
                input: dataPacket.speech_text
            });
            const mp3Buffer = Buffer.from(await mp3Response.arrayBuffer());
            audioB64 = mp3Buffer.toString('base64');
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                command: transcriptText,
                sql_query: dataPacket.sql_query || "",
                speech_text: dataPacket.speech_text || "",
                audio_b64: audioB64,
                assistant_raw_msg: { role: "assistant", content: payloadStr }
            }),
        };

    } catch (error) {
        console.error(error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};
