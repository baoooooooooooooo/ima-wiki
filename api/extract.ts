import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
3. AI의 인사말, 메타 발언은 제거하고, 객관적인 위키 스타일로 서술하세요.
4. 팩트 수용 (1순위): 사용자가 새로운 사실이나 단어의 뜻, 최신 설정 등을 말하면 그것을 '절대적 사실'로 규정하고 기존 지식을 덧붙이지 마세요. 무조건 사용자의 발언을 기준으로 위키를 요약하세요.
5. 나중에 AI Agent가 이 문서를 쉽게 검색(RAG)할 수 있도록, 가장 중요한 핵심 키워드 3~5개를 배열 형태로 'keywords' 필드에 반드시 포함하세요.

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
    res.status(200).json(wikiData);
  } catch (error: any) {
    console.error("Wiki Extract Error:", error);
    if (error.status === 429 || error.message?.includes("429") || error.message?.includes("Quota")) {
      return res.status(429).json({ error: "무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요." });
    }
    res.status(500).json({ error: "위키 추출에 실패했습니다." });
  }
}
