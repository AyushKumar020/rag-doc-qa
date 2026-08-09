"use client";

import { useState, useEffect } from "react";

interface Source {
  chunk_id: number;
  document_id: number;
  chunk_index: number;
  content: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

interface Doc {
  id: number;
  filename: string;
  uploaded_at: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [asking, setAsking] = useState(false);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("all");

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  async function fetchDocuments() {
    try {
      const res = await fetch(`${API_BASE}/documents`);
      const data = await res.json();
      setDocuments(data);
    } catch (err) {
      console.error("Failed to fetch documents", err);
    }
  }

  useEffect(() => {
    fetchDocuments();
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setUploadStatus("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        setUploadStatus(`Error: ${data.error}`);
      } else {
        setUploadStatus(
          `Uploaded "${data.filename}" — ${data.num_chunks} chunks indexed.`
        );
        fetchDocuments();
      }
    } catch (err) {
      setUploadStatus("Upload failed. Is the backend running?");
    } finally {
      setUploading(false);
    }
  }

  async function handleAsk() {
    if (!input.trim() || asking) return;

    const question = input;
    setInput("");
    setAsking(true);

    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      let url = `${API_BASE}/ask/stream?query=${encodeURIComponent(question)}`;
      if (selectedDocId !== "all") {
        url += `&document_id=${selectedDocId}`;
      }

      const res = await fetch(url);

      if (!res.body) throw new Error("No response body");

  const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let rawAccumulated = "";
      let sourcesParsed = false;
      let parsedSources: Source[] = [];
      let answerAccumulated = "";

      const DELIMITER = "\n---SOURCES-END---\n";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunkText = decoder.decode(value, { stream: true });
        rawAccumulated += chunkText;

        if (!sourcesParsed) {
          const delimIndex = rawAccumulated.indexOf(DELIMITER);
          if (delimIndex !== -1) {
            const sourcesJson = rawAccumulated.slice(0, delimIndex);
            try {
              parsedSources = JSON.parse(sourcesJson);
            } catch {
              parsedSources = [];
            }
            sourcesParsed = true;
            answerAccumulated = rawAccumulated.slice(delimIndex + DELIMITER.length);
          }
        } else {
          answerAccumulated += chunkText;
        }

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: answerAccumulated,
            sources: parsedSources,
          };
          return updated;
        });
      }
    } catch (err) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: "assistant",
          content: "Something went wrong. Is the backend running?",
        };
        return updated;
      });
    } finally {
      setAsking(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100 flex flex-col items-center p-6">
      <div className="w-full max-w-2xl flex flex-col gap-6">
        <h1 className="text-2xl font-semibold">RAG Doc Q&A</h1>

        {/* Upload section */}
        <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-3">
          <p className="text-sm text-gray-400">Upload a PDF to ask questions about it</p>
          <div className="flex gap-3">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm"
            />
            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 px-4 py-1.5 rounded-lg text-sm"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>
          </div>
          {uploadStatus && <p className="text-sm text-gray-400">{uploadStatus}</p>}
        </div>

        {/* Document selector */}
        <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-sm text-gray-400">Ask about:</p>
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            className="bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
          >
            <option value="all">All documents</option>
            {documents.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.filename} (#{doc.id})
              </option>
            ))}
          </select>
        </div>

        {/* Chat section */}
        <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-4 min-h-[400px]">
          <div className="flex flex-col gap-3 flex-1">
            {messages.length === 0 && (
              <p className="text-sm text-gray-500">
                Ask a question about your uploaded document.
              </p>
            )}
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-blue-600/20 self-end ml-12"
                    : "bg-gray-800 self-start mr-12"
                }`}
              >
                <div>{msg.content || (msg.role === "assistant" ? "..." : "")}</div>

                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <details className="mt-2 text-xs text-gray-400">
                    <summary className="cursor-pointer hover:text-gray-300">
                      Sources ({msg.sources.length})
                    </summary>
                    <div className="mt-1 flex flex-col gap-1">
                      {msg.sources.map((s) => (
                        <div key={s.chunk_id} className="bg-gray-900 rounded p-2">
                          <span className="text-gray-500">
                            doc #{s.document_id}, chunk {s.chunk_index}:
                          </span>{" "}
                          {s.content}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
              placeholder="Ask something about the document..."
              className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-sm outline-none"
            />
            <button
              onClick={handleAsk}
              disabled={asking}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 px-4 py-2 rounded-lg text-sm"
            >
              Ask
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}