// services/api.ts — All backend calls, with streaming support

import { auth } from "@/configs/firebaseConfig";

const BASE_URL = "https://hello-allie-backend.onrender.com";

async function getAuthToken(): Promise<string | null> {
  try {
    return (await auth.currentUser?.getIdToken()) ?? null;
  } catch {
    return null;
  }
}

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token   = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`API error ${response.status}: ${errorBody}`);
  }
  return response.json() as Promise<T>;
}

async function apiUpload<T>(endpoint: string, formData: FormData): Promise<T> {
  const token   = await getAuthToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST", headers, body: formData,
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Upload error ${response.status}: ${errorBody}`);
  }
  return response.json() as Promise<T>;
}

// ── Streaming smart call ──────────────────────────────────────────────────────
// Calls /api/smart with stream:true and invokes onToken for each token,
// onDone when complete. Returns the full assembled reply.
export async function streamSmart(
  body: SmartRequest,
  onToken: (token: string) => void,
  onDone: (fullText: string) => void,
  onError?: (err: Error) => void
): Promise<void> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const debugToken = await getAuthToken();
    console.log("[streamSmart] Auth token present:", !!debugToken, "length:", debugToken?.length);
    console.log("[streamSmart] Calling backend...");
    const response = await fetch(`${BASE_URL}/api/smart`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        ...body,
        prompt:   body.message,
        mode:     body.personality,
        messages: body.conversationHistory,
        stream:   true,
      }),
    });

    console.log("[streamSmart] Status:", response.status, "Content-Type:", response.headers.get("content-type"));

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[streamSmart] Error body:", errBody);
      throw new Error(`Stream error ${response.status}: ${errBody}`);
    }

    // Check content type — old backend returns JSON, new returns SSE
    const contentType = response.headers.get("content-type") || "";
    console.log("[streamSmart] Content type:", contentType);

    if (!contentType.includes("text/event-stream")) {
      // Not SSE — parse as regular JSON and treat as done
      const data = await response.json();
      console.log("[streamSmart] Got JSON response:", data?.result?.slice(0, 50));
      if (data?.result) {
        onDone(data.result);
      } else {
        throw new Error("Unexpected response format: " + JSON.stringify(data).slice(0, 100));
      }
      return;
    }

    if (!response.body) {
      throw new Error("Streaming not supported by current backend");
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText  = "";
    let buffer    = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.token) {
            fullText += data.token;
            onToken(data.token);
          }
          if (data.done) {
            onDone(fullText);
            return;
          }
        } catch { /* skip malformed lines */ }
      }
    }
    onDone(fullText);
  } catch (err: any) {
    onError?.(err);
  }
}

export interface SmartRequest {
  chatId:               string;
  message:              string;
  language?:            "en" | "es";
  personality?:         string;
  conversationHistory?: { role: string; content: string }[];
}

export interface SmartResponse {
  result: string;
  chatId: string;
}

export const api = {
  smart: (body: SmartRequest) =>
    apiFetch<SmartResponse>("/api/smart", {
      method: "POST",
      body:   JSON.stringify({
        ...body,
        prompt:   body.message,
        mode:     body.personality,
        messages: body.conversationHistory,
      }),
    }),

  transcribe: (audioUri: string, language: "en" | "es" = "en") => {
    const form = new FormData();
    form.append("file", { uri: audioUri, type: "audio/m4a", name: "recording.m4a" } as any);
    form.append("language", language);
    return apiUpload<{ text: string }>("/api/transcribe", form);
  },

  schedule: (prompt: string) =>
    apiFetch<{ message: string; options?: any[] }>("/api/schedule", {
      method: "POST",
      body:   JSON.stringify({ prompt }),
    }),

  scheduleDelete: (promptOrId: { prompt?: string; id?: string }) =>
    apiFetch<{ message: string; options?: any[] }>("/api/schedule/delete", {
      method: "POST",
      body:   JSON.stringify(promptOrId),
    }),

  saveOnboarding: (data: { displayName: string; goal: string; defaultPersonality: string }) =>
    apiFetch<{ success: boolean }>("/api/smart/onboarding", {
      method: "POST",
      body:   JSON.stringify(data),
    }),

  // Memory endpoints
  getMemories: () =>
    apiFetch<{ memories: string[] }>("/api/smart/memories"),

  deleteMemory: (fact: string) =>
    apiFetch<{ success: boolean }>("/api/smart/memories", {
      method: "DELETE",
      body:   JSON.stringify({ fact }),
    }),

  ping: () => apiFetch<{ status: string }>("/health"),
};