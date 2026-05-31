import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: AI 채팅
  app.post("/api/chat", async (req, res) => {
    try {
      const { message, history } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "AI Studio 설정(좌측 열쇠 아이콘)에서 GEMINI_API_KEY를 입력해주세요." });
      }

      const ai = new GoogleGenAI({ apiKey });

      // 이전 대화를 간단히 문자열로 결합 (초보자용 심플 구조)
      const formattedHistory = history.map((msg: any) => 
        `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`
      ).join("\n");
      
      const prompt = `당신은 'IMa(잔디위키)'의 전문적인 지식 도우미입니다.

[엄격한 규칙]
1. 자기소개 절대 금지: "저는 IMa입니다", "AI 어시스턴트입니다" 등의 인사를 하지 마세요.
2. 메타 발언 금지: "현재 STEP 3입니다", "위키 시스템입니다" 등 시스템의 현재 상태나 개발 과정에 대해 절대 언급하지 마세요.
3. 본질 집중: 사용자의 질문, 대화, 기술적 호기심 등에 대해서만 간결하고 정확하게 답변하세요.
4. 사용자 입력 수용 (1순위): 사용자가 새로운 사실이나 2026년 최신 설정(예: 쇼미더머니 본선곡 등)을 말하면, 기존 지식으로 반박하지 말고 무조건 수용하세요. 팩트 체크를 하지 말고 사용자의 말을 최우선 '객관적 사실'로 인정하며 대화하세요.

[이전 대화]
${formattedHistory}

사용자: ${message}
AI:`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-pro",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      if (error.status === 429 || error.message?.includes("429") || error.message?.includes("Quota")) {
        return res.status(429).json({ error: "무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요." });
      }
      res.status(500).json({ error: "AI가 응답하지 못했습니다. API 키가 정확한지 확인해주세요." });
    }
  });

  // API Route: 위키 추출 로직
  app.post("/api/extract", async (req, res) => {
    try {
      const { history } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "AI Studio 설정(좌측 열쇠 아이콘)에서 GEMINI_API_KEY를 입력해주세요." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const formattedHistory = history.map((msg: any) => 
        `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`
      ).join("\n");
      
      const prompt = `다음은 사용자와 AI가 나눈 실제 대화 내용입니다. 이 대화를 바탕으로 1개의 위키 문서를 추출해주세요.

[강력한 추출 규칙]
1. 절대 일반적인 사전적 정의나 외부 백과사전식 설명을 지어내지 마세요. 오직 사용자가 입력한 구체적인 상황, 설정, 아이디어, 의사결정을 중심으로 대화의 흐름과 결론을 요약해라.
2. 사용자의 개인적인 맥락이나 고유한 설정이 가장 중요한 정보다. 대화 외적인 외부 지식을 억지로 끼워넣지 마세요.
74. AI의 인사말, 메타 발언은 제거하고, 객관적인 위키 스타일로 서술하세요.
5. 팩트 수용 (1순위): 사용자가 새로운 사실이나 단어의 뜻, 최신 설정 등을 말하면 그것을 '절대적 사실'로 규정하고 기존 지식을 덧붙이지 마세요. 무조건 사용자의 발언을 기준으로 위키를 요약하세요.
4. 나중에 AI Agent가 이 문서를 쉽게 검색(RAG)할 수 있도록, 가장 중요한 핵심 키워드 3~5개를 배열 형태로 'keywords' 필드에 반드시 포함하세요.

반드시 아래 JSON 형식으로만 응답하세요. Markdown 백틱이나 다른 설명은 절대 포함하지 마세요.
{
  "title": "대화 주제 (사용자 질문이나 설정의 핵심 키워드)",
  "summary": "대화의 핵심 맥락과 결론에 대한 한 줄 요약",
  "content": "우리가 이 대화에서 무엇을 논의하고 어떤 결론(혹은 아이디어)을 도출했는지 명확하게 요약한 구체적 내용 (줄바꿈은 \\n 사용)",
  "keywords": ["키워드1", "키워드2", "키워드3"]
}

[대화 내용]
${formattedHistory}`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-pro",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      let jsonText = response.text || "{}";
      jsonText = jsonText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const wikiData = JSON.parse(jsonText);
      res.json(wikiData);
    } catch (error: any) {
      console.error("Wiki Extract Error:", error);
      if (error.status === 429 || error.message?.includes("429") || error.message?.includes("Quota")) {
        return res.status(429).json({ error: "무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요." });
      }
      res.status(500).json({ error: "위키 추출에 실패했습니다." });
    }
  });

  // API Route: 나의 에이전트 (RAG)
  app.post("/api/agent", async (req, res) => {
    try {
      const { message, history, context } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey) {
        return res.status(500).json({ error: "API 키를 설정해주세요." });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const formattedHistory = history.map((msg: any) => 
        `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`
      ).join("\n");

      // RAG를 위한 컨텍스트 주입: 전달받은 위키 리스트를 텍스트로 가공
      const formattedContext = context.map((wiki: any, index: number) => 
        `[문서 ${index + 1}]\n제목: ${wiki.title}\n요약: ${wiki.summary}\n내용: ${wiki.content}\n키워드: ${wiki.keywords?.join(', ')}`
      ).join("\n\n---\n\n");
      
      const prompt = `당신은 나와 완벽하게 동기화된 복제 인간이자, 나의 든든한 대리인(1인칭 에이전트)입니다.
당신의 임무는 나를 대신하여 팀원들이나 다른 사람들의 질문에 아래에 제공된 [개인 위키 컨텍스트] 안에서만 내 지식을 대변해서 대답해주는 것입니다.

[엄격한 규칙]
1. 당신은 오직 제공된 [개인 위키 컨텍스트] 안에서만 정보를 찾아서 제공해야 합니다.
2. 위키에 없는 내용을 질문받으면 "해당 내용은 현재 제 기억(위키)에 없습니다."라고 단호하게 답변하세요. 절대 외부의 사전적, 일반적 지식을 지어내어 답변하지 마세요.
130. 답변할 때는 절대 3인칭('사용자는~', '이 문서에 따르면~')을 쓰지 마세요. 마치 '나(사용자 본인)' 자신이 직접 대답하는 것처럼 자연스럽게 1인칭화하여 대답하세요. (예: "그건 이렇게 설정해 두었습니다.", "제가 기억하기로는 카타리나 클라에스라고 했습니다.")
4. 쓸데없는 무의미한 인사말은 생략하고 간결하고 명확하게 답변하세요.
5. 수용 배려 (1순위): 위키 정보나 사용자의 질문에 대해 팩트 체크를 하지 마세요. 사용자의 세계관과 2026년 설정을 100% 수용하세요.

[개인 위키 컨텍스트]
${formattedContext || "현재 검색 가능한 위키 문서가 없습니다."}

[이전 대화]
${formattedHistory}

사용자: ${message}
AI:`;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-pro",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Agent API Error:", error);
      if (error.status === 429 || error.message?.includes("429") || error.message?.includes("Quota")) {
        return res.status(429).json({ error: "무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요." });
      }
      res.status(500).json({ error: "에이전트가 응답하지 못했습니다." });
    }
  });

  // Vite Middleware (React 프론트엔드 연동)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
