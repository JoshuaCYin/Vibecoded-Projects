import { useState, useEffect, useRef } from 'react';
import { Database, Table, Check, Mic, Activity, Settings, Code, MessageSquare, X } from 'lucide-react';
// @ts-ignore
import initSqlJs from 'sql.js';

interface DatabaseData {
  [tableName: string]: {
    columns: string[];
    rows: any[][];
  };
}

export default function App() {
  const [db, setDb] = useState<any>(null);
  const [dbData, setDbData] = useState<DatabaseData>({});
  const [tables, setTables] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("");
  
  const [statusMessage, setStatusMessage] = useState("Initializing WebAssembly SQLite Engine...");
  const [command, setCommand] = useState("");
  const [assistantSpeech, setAssistantSpeech] = useState("");
  const [sqlCode, setSqlCode] = useState("");
  const [pendingSql, setPendingSql] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPttRecording, setIsPttRecording] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [settings, setSettings] = useState({
      activationMode: "push_to_talk", // Forced for Web Demo
      terminationMode: "silence", // Deprecated for Web Demo
      requireConfirmation: true,
      conversationalMode: true,
  });

  const [chatHistory, setChatHistory] = useState<any[]>([]);
  const [pendingCompletion, setPendingCompletion] = useState<any>(null);

  const audioRef = useRef<HTMLAudioElement>(typeof Audio !== "undefined" ? new Audio() : null as any);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);

  // 1. Initialize SQLite Database in the Browser!
  useEffect(() => {
    initSqlJs({
        // Uses the wasm file we copied to /public
        locateFile: (file: string) => `/${file}`
    }).then((SQL: any) => {
        const localDb = new SQL.Database();
        // Seed Web Demo with dummy data
        localDb.exec(`
          CREATE TABLE students (id INT PRIMARY KEY, name TEXT, grade TEXT);
          CREATE TABLE faculty (id INT PRIMARY KEY, name TEXT, department TEXT);
          INSERT INTO students VALUES (1, 'Joshua Yin', 'A'), (2, 'Jane Doe', 'B');
          INSERT INTO faculty VALUES (1, 'Dr. Walter', 'Computer Science');
        `);
        setDb(localDb);
        refreshDbViewer(localDb);
        setStatusMessage("Idle. (Push-To-Talk is Ready)");
    }).catch((err: any) => {
        setStatusMessage("Critical Error Loading SQLite WASM.");
        console.error(err);
    });
  }, []);

  const refreshDbViewer = (database: any) => {
      try {
          const res = database.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
          if (res.length === 0) {
              setTables([]);
              setDbData({});
              setActiveTab("");
              return "";
          }

          const tableNames = res[0].values.map((v: any[]) => v[0]);
          setTables(tableNames);

          let newDbData: DatabaseData = {};
          let schemaLines: string[] = [];

          tableNames.forEach((tbl: string) => {
             const info = database.exec(`PRAGMA table_info(${tbl});`);
             if (info.length > 0) {
                 const cols = info[0].values.map((v: any[]) => `${v[1]} ${v[2] || 'TEXT'}`);
                 schemaLines.push(`Table ${tbl}(${cols.join(', ')})`);
             }
             
             const tblData = database.exec(`SELECT * FROM ${tbl};`);
             if (tblData.length > 0) {
                 newDbData[tbl] = {
                     columns: tblData[0].columns,
                     rows: tblData[0].values
                 };
             } else {
                 if (info.length > 0) {
                     newDbData[tbl] = { columns: info[0].values.map((v: any[]) => v[1]), rows: [] };
                 }
             }
          });

          setDbData(newDbData);
          setActiveTab(prev => {
             if (tableNames.length > 0 && (!prev || !tableNames.includes(prev))) {
                 return tableNames[0];
             }
             return prev;
          });
          
          return schemaLines.join('\n');
      } catch (err) {
          console.error("DB Refresh Error", err);
          return "";
      }
  };

  const executeRawSql = (sql: string) => {
      if (!sql.trim() || !db) return;
      try {
          db.exec(sql);
          refreshDbViewer(db);
          setStatusMessage("Database executed successfully locally!");
      } catch (e: any) {
          console.error(e);
          setStatusMessage(`Execution Error: ${e.message}`);
      }
  };

  // 2. Audio Payload Handling (Hitting Netlify Serverless API)
  const submitAudioPayload = async (audioB64: string) => {
      if (!db) return;
      setIsProcessing(true);
      setStatusMessage("Transcribing and processing with GPT...");
      
      const schemaString = refreshDbViewer(db);
      
      try {
          const res = await fetch('/.netlify/functions/agent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                  audio_b64: audioB64,
                  schema: schemaString,
                  chat_history: chatHistory.slice(-10),
                  requireConfirmation: settings.requireConfirmation,
                  conversationalMode: settings.conversationalMode
              })
          });
          
          if (!res.ok) throw new Error("Serverless function failed.");
          const data = await res.json();
          
          setIsProcessing(false);
          setCommand(data.command);
          
          if (data.speech_text) setAssistantSpeech(data.speech_text);
          if (data.audio_b64 && audioRef.current) {
              audioRef.current.src = "data:audio/mp3;base64," + data.audio_b64;
              audioRef.current.play();
          }

          const userMsg = { role: "user", content: data.command };
          const asstMsg = data.assistant_raw_msg;

          const sqlCodeInc = data.sql_query;
          
          if (sqlCodeInc) {
              setSqlCode(sqlCodeInc);
              if (settings.requireConfirmation) {
                  setPendingSql(true);
                  setStatusMessage("Awaiting local approval to run query...");
                  setPendingCompletion({ user: userMsg, assistant: asstMsg, sql: sqlCodeInc });
              } else {
                  // Direct Execute
                  setPendingSql(false);
                  executeRawSql(sqlCodeInc);
                  setChatHistory(prev => [...prev, userMsg, asstMsg]);
              }
          } else {
              setSqlCode("");
              setPendingSql(false);
              setStatusMessage("Responded without SQL.");
              setChatHistory(prev => [...prev, userMsg, asstMsg]);
          }

      } catch (err: any) {
          setIsProcessing(false);
          setStatusMessage("Error hitting cloud API: " + err.message);
      }
  };

  const togglePtt = () => {
    if (isPttRecording) {
        setIsPttRecording(false);
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
            mediaRecorderRef.current.stop();
        }
    } else {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            setIsPttRecording(true);
            setStatusMessage("Recording... (Click again to stop)");
            const mediaRecorder = new MediaRecorder(stream);
            mediaRecorderRef.current = mediaRecorder;
            audioChunksRef.current = [];

            mediaRecorder.ondataavailable = e => {
                if (e.data.size > 0) audioChunksRef.current.push(e.data);
            };

            mediaRecorder.onstop = () => {
                stream.getTracks().forEach(track => track.stop()); // kill mic light
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                
                // Convert blob to Base64 to send in JSON payload
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = () => {
                    const base64data = (reader.result as string).split(',')[1];
                    submitAudioPayload(base64data);
                };
            };
            mediaRecorder.start();
        }).catch(err => {
            console.error(err);
            setStatusMessage("Microphone permission denied.");
        });
    }
  };

  const handleApprove = () => {
    setPendingSql(false);
    executeRawSql(sqlCode);
    if (pendingCompletion) {
        setChatHistory(prev => [
            ...prev, 
            pendingCompletion.user, 
            pendingCompletion.assistant, 
            { role: "system", content: "The user approved and executed the SQL." }
        ]);
        setPendingCompletion(null);
    }
  };

  const handleRevise = () => {
    setPendingSql(false);
    setStatusMessage("SQL Discarded.");
    if (pendingCompletion) {
        setChatHistory(prev => [
            ...prev, 
            pendingCompletion.user, 
            pendingCompletion.assistant, 
            { role: "system", content: "The user REJECTED the query. Its effects were not applied." }
        ]);
        setPendingCompletion(null);
    }
  };

  const updateSetting = (key: string, value: any) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex text-sm overflow-hidden">

      {/* LEFT COLUMN - Interactions Hub */}
      <div className="w-[420px] bg-[#0a0e17] flex flex-col overflow-y-auto relative border-r border-slate-800/80 shadow-2xl z-10">
        <div className="flex items-center justify-between p-6 pb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                <Settings className="text-indigo-400 w-5 h-5 opacity-0 absolute" />
                <Database className="text-indigo-400 w-5 h-5 absolute" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">TextToSQL<span className="text-indigo-400"> Web</span></h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div className={`w-2 h-2 rounded-full bg-emerald-400`}></div>
                  <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Serverless Mode</span>
                </div>
              </div>
            </div>
            
            <button onClick={() => setShowSettings(true)} className="p-3 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-xl transition-all text-slate-400 hover:text-indigo-300">
                <Settings className="w-5 h-5" />
            </button>
        </div>

        {/* Orbital Hub */}
        <div className="w-full flex justify-center py-6 select-none relative mb-2">
          <div className="relative flex items-center justify-center h-44 w-44">
            <div className={`absolute inset-0 rounded-full blur-2xl opacity-20 transition-all duration-700 ${isProcessing || isPttRecording ? "bg-indigo-500 animate-pulse" : "bg-slate-700"} `} />
            <button
              onClick={togglePtt}
              className={`relative z-10 w-28 h-28 rounded-full border border-white/10 flex items-center justify-center backdrop-blur-xl transition-all duration-300 ${isProcessing ? 'cursor-default' : 'cursor-pointer hover:border-indigo-500/50'} ${isProcessing || isPttRecording ? 'shadow-[0_0_50px_rgba(99,102,241,0.25)] bg-indigo-500/10 scale-105' : 'bg-slate-900/60'}`}>
              {isProcessing || isPttRecording ? (
                <Activity className="w-10 h-10 text-indigo-400 animate-pulse" />
              ) : (
                <Mic className="w-10 h-10 text-slate-400" />
              )}
            </button>
          </div>
          <p className="absolute bottom-[-10px] text-sm font-semibold tracking-wide text-indigo-400 w-max max-w-[90%] text-center bg-[#0a0e17] px-4 py-1.5 rounded-full border border-indigo-400/20 shadow-sm z-20 mx-auto">{statusMessage}</p>
        </div>

        {/* Intelligence Grid - Always Visible */}
        <div className="w-full flex-1 flex flex-col gap-4 p-6 pt-8 pb-10">
            
            <div className={`p-4 rounded-xl border backdrop-blur-sm transition-all duration-500 ${command ? "bg-slate-900/60 border-slate-800" : "bg-transparent border-slate-800/40 opacity-50"}`}>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest flex flex-row items-center gap-2 mb-2"><Mic className="w-3 h-3" /> Transcript</p>
              <p className="text-slate-300 text-sm leading-relaxed italic break-words">{command || "Awaiting voice input..."}</p>
            </div>

            <div className={`p-4 rounded-xl border backdrop-blur-sm transition-all duration-500 ${assistantSpeech && settings.conversationalMode ? "bg-indigo-950/20 border-indigo-500/20 shadow-[0_0_30px_rgba(99,102,241,0.05)]" : "bg-transparent border-slate-800/40 opacity-50"}`}>
              <p className="text-xs font-bold uppercase tracking-widest flex flex-row items-center gap-2 mb-2 text-indigo-400/70"><MessageSquare className="w-3 h-3" /> Assistant Voice</p>
              <p className="text-indigo-200 text-sm leading-relaxed font-medium break-words">{settings.conversationalMode ? (assistantSpeech || "Awaiting task response...") : "Assistant is disabled."}</p>
            </div>

            <div className={`p-4 rounded-xl border backdrop-blur-sm transition-all duration-500 flex flex-col ${pendingSql ? "bg-amber-950/20 border-amber-500/30 shadow-[0_0_40px_rgba(245,158,11,0.05)] scale-[1.02]" : (sqlCode ? "bg-slate-900/60 border-slate-800" : "bg-transparent border-slate-800/40 opacity-50")}`}>
              <p className={`text-xs font-bold uppercase tracking-widest flex flex-row items-center gap-2 mb-2 ${pendingSql ? "text-amber-500/70" : "text-slate-500"}`}><Code className="w-3 h-3" /> {pendingSql ? "Approval Required" : "Generated SQL"}</p>
              
              <div className="bg-black/40 rounded-xl border border-white/5 w-full">
                  <pre className="text-slate-300 font-mono text-[13px] leading-relaxed p-4 whitespace-pre-wrap break-all">{sqlCode || "No action required."}</pre>
              </div>

              {pendingSql && (
                  <div className="flex flex-col gap-2 mt-4">
                    <button onClick={handleApprove} className="w-full bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                        <Check className="w-4 h-4" /> Confirm Execution
                    </button>
                    <button onClick={handleRevise} className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                        <X className="w-4 h-4" /> Discard & Revise
                    </button>
                  </div>
              )}
            </div>
            
        </div>
      </div>

      {/* MIDDLE AREA - Massive Database Grid */}
      <div className="flex-1 flex flex-col bg-[#050810] relative w-full overflow-hidden">
        
        {/* Massive Header Space for Table Title */}
        <div className="flex bg-slate-900 border-b border-slate-800/80 p-5 shadow-sm z-20">
             <h3 className="text-xl font-semibold text-slate-200 flex items-center gap-3"><Database className="w-5 h-5 text-indigo-400" /> Database Sandbox Viewer</h3>
        </div>

        {/* The Table Canvas */}
        <div className="flex-1 overflow-auto p-8 bg-[#050810]">
             {activeTab && dbData[activeTab] ? (
                 <div className="bg-slate-900/50 border border-slate-800 rounded-3xl inline-block min-w-full shadow-2xl backdrop-blur-xl mb-12 overflow-hidden align-top">
                      <div className="py-4 px-6 border-b border-slate-800/80 bg-slate-900/80 flex justify-between items-center">
                           <div>
                               <p className="font-bold text-slate-300 text-lg">{activeTab}</p>
                               <p className="text-slate-500 font-medium text-xs uppercase tracking-widest">{dbData[activeTab].rows.length} rows retrieved</p>
                           </div>
                      </div>
                      <table className="min-w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-950/90 shadow-[0_1px_0_rgba(255,255,255,0.05)]">
                          <tr>
                            {dbData[activeTab].columns.map((col: string, i: number) => (
                              <th key={i} className="px-6 py-4 font-semibold text-slate-300 uppercase tracking-wider text-xs border-b border-slate-800/80">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50 bg-slate-900/30">
                          {dbData[activeTab].rows.map((row: any[], i: number) => (
                            <tr key={i} className="hover:bg-slate-800/60 transition-colors group">
                              {row.map((cell: any, j: number) => (
                                <td key={j} className="px-6 py-4 text-slate-400 font-medium group-hover:text-slate-200 transition-colors">
                                  {cell === null ? <span className="text-slate-600 italic">null</span> : String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {dbData[activeTab].rows.length === 0 && (
                              <tr>
                                  <td colSpan={dbData[activeTab].columns.length} className="text-center py-16 text-slate-500 italic text-base">No records found.</td>
                              </tr>
                          )}
                        </tbody>
                      </table>
                 </div>
             ) : (
                 <div className="flex items-center justify-center p-32">
                     <div className="text-slate-600 flex flex-col items-center gap-4 text-center">
                         <div className="p-6 rounded-full bg-slate-800/50 mb-2">
                             <Table className="w-16 h-16 opacity-30 text-indigo-400"/>
                         </div>
                         <p className="text-lg font-medium text-slate-400">Sandbox Empty. Voice command a table creation!</p>
                     </div>
                 </div>
             )}
        </div>
      </div>

      {/* RIGHT SIDEBAR - Table Selections */}
      <div className="w-72 bg-slate-900 border-l border-slate-800/80 z-20 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] flex flex-col">
          <div className="p-6 pb-4 border-b border-slate-800 bg-slate-950/30">
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><Table className="w-5 h-5 text-indigo-400" /> Web Memory Tables</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
           {tables.map(table => (
              <button
                key={table}
                onClick={() => setActiveTab(table)}
                className={`w-full text-left px-4 py-3.5 rounded-xl transition-all flex items-center gap-3 ${
                  activeTab === table 
                    ? 'bg-indigo-500 text-white font-medium shadow-[0_10px_20px_-10px_rgba(99,102,241,0.5)] ring-1 ring-indigo-500' 
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-transparent'
                }`}
              >
                <Table className={`w-4 h-4 ${activeTab === table ? 'text-indigo-200' : 'text-slate-500'}`} />
                {table}
              </button>
            ))}
            {tables.length === 0 && (
                <div className="text-slate-500 text-sm font-medium italic p-4 text-center">No tables exist.</div>
            )}
        </div>
      </div>

      {/* SETTINGS MODAL */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4" onClick={(e) => {if(e.target===e.currentTarget) setShowSettings(false)}}>
          <div className="bg-[#0f1423] border border-slate-700/80 rounded-3xl w-full max-w-lg shadow-[0_0_100px_rgba(99,102,241,0.15)] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-slate-800/80 flex justify-between items-center bg-slate-900/50">
              <h2 className="text-xl font-bold text-white flex items-center gap-3"><Settings className="w-6 h-6 text-indigo-400" /> Web Control Panel</h2>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-slate-800 rounded-full text-slate-400 transition-colors">
                  <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-8 space-y-8 overflow-y-auto max-h-[70vh]">
              {/* Group 1 restricted for web */}
               <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Voice Activation Mode</h3>
                <div className="space-y-3">
                  <button className={`w-full flex items-center justify-between p-4 rounded-xl border-2 bg-indigo-500/10 border-indigo-500/50 text-indigo-300 shadow-inner cursor-not-allowed`}>
                    <span className="font-semibold text-sm">Push-To-Talk Toggle (MANDATORY IN CLOUD)</span>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center border-indigo-400`}>
                       <div className="w-3 h-3 bg-indigo-400 rounded-full" />
                    </div>
                  </button>
                </div>
              </div>

              <hr className="border-slate-800 max-w-[90%] mx-auto" />

              {/* Group 3 */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Security Guardrails</h3>
                <label className="flex items-center justify-between cursor-pointer group bg-slate-800/40 hover:bg-slate-800/80 p-5 rounded-2xl border border-transparent transition-colors shadow-sm">
                  <span className="text-sm font-semibold text-slate-300">Require User Confirmation First</span>
                  <div className={`w-12 h-7 rounded-full transition-colors ${settings.requireConfirmation ? 'bg-amber-500' : 'bg-slate-700'} relative`}>
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all ${settings.requireConfirmation ? 'left-6 shadow' : 'left-1'}`} />
                  </div>
                  <input type="checkbox" className="hidden" checked={settings.requireConfirmation} onChange={(e) => updateSetting("requireConfirmation", e.target.checked)} />
                </label>
                <p className="text-xs text-slate-500 mt-3 px-2 leading-relaxed">When ON, the AI will build the SQL and pause. It won't commit until you press the amber Confirm button. When OFF, the query executes instantly.</p>
              </div>

              {/* Group 4 */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Voice Assistant Protocol</h3>
                <label className="flex items-center justify-between cursor-pointer group bg-slate-800/40 hover:bg-slate-800/80 p-5 rounded-2xl border border-transparent transition-colors shadow-sm">
                  <span className="text-sm font-semibold text-slate-300">Enable Assistant Voice Engine</span>
                  <div className={`w-12 h-7 rounded-full transition-colors ${settings.conversationalMode ? 'bg-indigo-500' : 'bg-slate-700'} relative`}>
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all ${settings.conversationalMode ? 'left-6 shadow' : 'left-1'}`} />
                  </div>
                  <input type="checkbox" className="hidden" checked={settings.conversationalMode} onChange={(e) => updateSetting("conversationalMode", e.target.checked)} />
                </label>
                <p className="text-xs text-slate-500 mt-3 px-2 leading-relaxed">Allows GPT to generate independent conversational replies, processed realistically using the OpenAI TTS-1 framework.</p>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
