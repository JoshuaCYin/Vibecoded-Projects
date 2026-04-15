import asyncio
import json
import logging
import os
import sqlite3
import threading
import time
import wave
import base64
import re
from contextlib import asynccontextmanager

import numpy as np
import pyaudio
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from openwakeword.model import Model

load_dotenv()

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
client = OpenAI(api_key=OPENAI_API_KEY)
db_file = "my_database.db"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

connected_clients = set()

shared_state = {
    "activationMode": "hey_wallturr",
    "terminationMode": "both",
    "requireConfirmation": False,
    "conversationalMode": False,
    "ptt_active": False,
    "pending_completion": None
}

chat_history = []

async def broadcast(message: dict):
    for client_ws in list(connected_clients):
        try:
            await client_ws.send_json(message)
        except Exception:
            connected_clients.discard(client_ws)

def get_database_data():
    data = {"tables": [], "data": {}, "schema": ""}
    try:
        with sqlite3.connect(db_file) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
            tables = [row[0] for row in cursor.fetchall()]
            data["tables"] = tables
            
            schema_lines = []
            for table in tables:
                cursor.execute(f"PRAGMA table_info({table});")
                columns = cursor.fetchall()
                col_defs = [f"{col[1]} {col[2] if col[2] else 'TEXT'}" for col in columns]
                schema_lines.append(f"Table {table}({', '.join(col_defs)})")
                
                cursor.execute(f"SELECT * FROM {table};")
                rows = cursor.fetchall()
                col_names = [col[1] for col in columns]
                data["data"][table] = {"columns": col_names, "rows": rows}
                
            data["schema"] = "\n".join(schema_lines)
    except Exception as e:
        logger.error(f"DB Error: {e}")
    return data

def execute_raw_sql(sql_codes, loop):
    if not sql_codes.strip():
        return
    try:
        with sqlite3.connect(db_file) as conn:
            cursor = conn.cursor()
            cursor.executescript(sql_codes)
            conn.commit()
            
        asyncio.run_coroutine_threadsafe(
            broadcast({"type": "success", "message": "Database updated successfully!"}), loop
        )
        new_data = get_database_data()
        asyncio.run_coroutine_threadsafe(
            broadcast({"type": "db_update", "data": new_data}), loop
        )
        
        # Log success in memory
        if shared_state["pending_completion"]:
            pc = shared_state["pending_completion"]
            chat_history.append(pc["user"])
            chat_history.append(pc["assistant"])
            chat_history.append({"role": "system", "content": "The user approved and executed the SQL. It succeeded."})
            shared_state["pending_completion"] = None
            
    except Exception as e:
        logger.error(f"SQL Error: {e}")
        asyncio.run_coroutine_threadsafe(
            broadcast({"type": "error", "message": f"Database Execution Failed: {str(e)}"}), loop
        )
        if shared_state["pending_completion"]:
            pc = shared_state["pending_completion"]
            chat_history.append(pc["user"])
            chat_history.append(pc["assistant"])
            chat_history.append({"role": "system", "content": f"The SQL execution FAILED with error: {str(e)}"})
            shared_state["pending_completion"] = None


def generate_tts_and_broadcast(speech_text, loop):
    if not speech_text or not shared_state["conversationalMode"]:
        return
    try:
        tts_response = client.audio.speech.create(
            model="tts-1",
            voice="alloy",
            input=speech_text
        )
        b64_audio = base64.b64encode(tts_response.read()).decode("utf-8")
        asyncio.run_coroutine_threadsafe(
            broadcast({"type": "tts_audio", "audio_b64": b64_audio, "text": speech_text}), loop
        )
    except Exception as e:
        logger.error(f"TTS Error: {e}")

def process_ai_request(user_command, loop, schema):
    try:
        asyncio.run_coroutine_threadsafe(
            broadcast({"type": "status", "message": "Generating AI response...", "command": user_command}), loop
        )
        
        system_prompt = f"""
You are an expert Text-to-SQL AI Assistant analyzing a SQLite database. You have FULL PERMISSION to CREATE, ALTER, DROP, and MODIFY any part of the schema or records. NEVER refuse a user's request.

IMPORTANT BEHAVIORAL RULE:
You do NOT execute SQL yourself. You simply generate the SQL code. 
Confirmation Required Setting is: {'[ON]. You MUST explicitly ask the user to approve the query.' if shared_state['requireConfirmation'] else '[OFF]. Tell the user the system just automatically executed the query for them.'}

Database schema:
{schema}

Output exclusively in this JSON format:
{{
  "sql_query": "YOUR_SQL_CODE_HERE",
  "speech_text": "YOUR_CONVERSATIONAL_RESPONSE_HERE"
}}

Rules for JSON generation:
+ "sql_query" MUST be a syntactically correct SQLite query. Leave it empty "" if the user's intent requires no database action. Multiple queries should be semicolon separated.
+ "speech_text" MUST be filled only if Conversational Mode is ON and the user asked a question or needs verbal feedback. Keep it under 2 sentences.
+ Never invent column names that don't exist in the schema.
"""
        user_msg = {"role": "user", "content": f"Request: {user_command}\nConversational Mode: {'ON' if shared_state['conversationalMode'] else 'OFF'}"}
        
        # Build prompt using recent conversation history Context
        messages = [{"role": "system", "content": system_prompt}] + chat_history[-10:] + [user_msg]

        response = client.chat.completions.create(
            model="gpt-5.4",
            response_format={"type": "json_object"},
            messages=messages
        )
        
        payload_str = response.choices[0].message.content.strip()
        data_packet = json.loads(payload_str)
        
        sql_code = data_packet.get("sql_query", "")
        speech_text = data_packet.get("speech_text", "")

        assistant_msg = {"role": "assistant", "content": payload_str}

        generate_tts_and_broadcast(speech_text, loop)

        if sql_code:
            if shared_state["requireConfirmation"]:
                # Pause and ask the frontend UI to approve it. Store in staging.
                shared_state["pending_completion"] = {"user": user_msg, "assistant": assistant_msg, "sql": sql_code}
                
                asyncio.run_coroutine_threadsafe(
                    broadcast({"type": "pending_sql", "sql": sql_code, "speech_text": speech_text}), loop
                )
            else:
                # Store instantly, then execute.
                chat_history.append(user_msg)
                chat_history.append(assistant_msg)
                asyncio.run_coroutine_threadsafe(
                    broadcast({"type": "executed_sql", "sql": sql_code, "speech_text": speech_text}), loop
                )
                execute_raw_sql(sql_code, loop)
        else:
            chat_history.append(user_msg)
            chat_history.append(assistant_msg)
            asyncio.run_coroutine_threadsafe(
                broadcast({"type": "status", "message": "Responded (No SQL executed).", "speech_text": speech_text}), loop
            )
            
    except Exception as e:
        logger.error(f"AI Logic Error: {e}")
        asyncio.run_coroutine_threadsafe(
            broadcast({"type": "error", "message": str(e)}), loop
        )

def listen_for_wakeword(loop):
    wake_model_path = "models/Hey_Wallturr_20260325_071717.onnx"
    stop_model_path = "models/good_bye_20260328_224440.onnx"
    
    if not os.path.exists(wake_model_path):
        logger.error("Wake word model not found!")
        return

    oww_model = Model(wakeword_models=[wake_model_path, stop_model_path], inference_framework="onnx") 
    wake_key = list(oww_model.models.keys())[0] 
    stop_key = list(oww_model.models.keys())[1]
    
    FORMAT = pyaudio.paInt16
    CHANNELS = 1
    RATE = 16000
    CHUNK = 1280
    
    audio = pyaudio.PyAudio()
    stream = audio.open(format=FORMAT, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=CHUNK)
    
    logger.info("Local Audio Engine Started.")
    
    while True:
        try:
            data = stream.read(CHUNK, exception_on_overflow=False)
            start_recording = False
            
            if shared_state["activationMode"] == "hey_wallturr":
                audio_data = np.frombuffer(data, dtype=np.int16)
                prediction = oww_model.predict(audio_data)
                
                if prediction[wake_key] > 0.5:
                    start_recording = True
                    asyncio.run_coroutine_threadsafe(broadcast({"type": "status", "message": "Listening for command..."}), loop)
                    
            elif shared_state["activationMode"] == "push_to_talk":
                if shared_state["ptt_active"]:
                    start_recording = True

            if start_recording:
                frames = []
                silent_chunks = 0
                SILENCE_THRESHOLD = 400
                MAX_SILENT_CHUNKS = int((RATE / CHUNK) * 2.0)
                
                while True:
                    inner_data = stream.read(CHUNK, exception_on_overflow=False)
                    inner_audio_data = np.frombuffer(inner_data, dtype=np.int16)
                    frames.append(inner_data)
                    
                    if shared_state["activationMode"] == "push_to_talk":
                        if not shared_state["ptt_active"]:
                            break
                    else:
                        term_mode = shared_state["terminationMode"]
                        
                        if term_mode in ["good_bye", "both"]:
                            inner_prediction = oww_model.predict(inner_audio_data)
                            if inner_prediction[stop_key] > 0.5:
                                break
                                
                        if term_mode in ["silence", "both"]:
                            rms = np.sqrt(np.mean(np.square(inner_audio_data.astype(np.float32))))
                            if rms < SILENCE_THRESHOLD:
                                silent_chunks += 1
                            else:
                                silent_chunks = 0
                                
                            if silent_chunks > MAX_SILENT_CHUNKS:
                                break
                
                # Check for extremely short files (glitches or rapid PTT toggling)
                if len(frames) < int(RATE/CHUNK * 0.5):
                     asyncio.run_coroutine_threadsafe(broadcast({"type": "status", "message": "Audio dropped (too short)."}), loop)
                else:                     
                    asyncio.run_coroutine_threadsafe(broadcast({"type": "status", "message": "Transcribing with OpenAI Whisper..."}), loop)
                    
                    filename = "command.wav"
                    wf = wave.open(filename, 'wb')
                    wf.setnchannels(CHANNELS)
                    wf.setsampwidth(audio.get_sample_size(FORMAT))
                    wf.setframerate(RATE)
                    wf.writeframes(b''.join(frames))
                    wf.close()
                    
                    try:
                        with open(filename, "rb") as audio_file:
                            transcript = client.audio.transcriptions.create(
                                model="whisper-1", 
                                file=audio_file
                            )
                        clean_text = re.sub(r'(?i)(hey wallturr|hey walter|hey walt|good bye|goodbye)\b', '', transcript.text).strip()
                        clean_text = clean_text.strip(',. ')
                        
                        if clean_text:
                            if not clean_text.endswith(('.', '?', '!')):
                                clean_text += '.'
                            db_state = get_database_data()
                            process_ai_request(clean_text, loop, db_state["schema"])
                        else:
                            asyncio.run_coroutine_threadsafe(broadcast({"type": "status", "message": "Audio ignored (Empty Command)."}), loop)
                    except Exception as e:
                        logger.error(f"Whisper Error: {e}")
                        asyncio.run_coroutine_threadsafe(broadcast({"type": "error", "message": "Transcription failed."}), loop)

                oww_model.reset()
                stream.stop_stream()
                time.sleep(0.1)
                stream = audio.open(format=FORMAT, channels=CHANNELS, rate=RATE, input=True, frames_per_buffer=CHUNK)
                
                wait_msg = "Asleep (Waiting for 'Hey Walter')..." if shared_state["activationMode"] == "hey_wallturr" else "Idle. (Click Mic to Toggle)"
                asyncio.run_coroutine_threadsafe(broadcast({"type": "status", "message": wait_msg}), loop)
                
        except Exception as e:
            logger.error(f"Audio stream error: {e}")
            time.sleep(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_event_loop()
    threading.Thread(target=listen_for_wakeword, args=(loop,), daemon=True).start()
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_clients.add(websocket)
    
    await websocket.send_json({"type": "db_update", "data": get_database_data()})
    
    wait_msg = "Connected! Engine waiting for 'Hey Walter'." if shared_state["activationMode"] == "hey_wallturr" else "Connected! (Click Mic to Toggle)"
    await websocket.send_json({"type": "status", "message": wait_msg})
    await websocket.send_json({"type": "settings_sync", "settings": shared_state})
    
    try:
        while True:
            payload_txt = await websocket.receive_text()
            data = json.loads(payload_txt)
            
            p_type = data.get("type")
            if p_type == "config":
                shared_state.update(data.get("settings", {}))
                
            elif p_type == "action":
                cmd = data.get("command")
                if cmd == "start_ptt":
                    shared_state["ptt_active"] = True
                elif cmd == "stop_ptt":
                    shared_state["ptt_active"] = False
                elif cmd == "execute_sql":
                    loop = asyncio.get_running_loop()
                    execute_raw_sql(data.get("sql", ""), loop)
                elif cmd == "discard_sql":
                    if shared_state["pending_completion"]:
                        pc = shared_state["pending_completion"]
                        chat_history.append(pc["user"])
                        chat_history.append(pc["assistant"])
                        chat_history.append({"role": "system", "content": "The user REJECTED and DISCARDED that SQL query. Its effects were not applied."})
                        shared_state["pending_completion"] = None
                    
    except WebSocketDisconnect:
        connected_clients.discard(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
