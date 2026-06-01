import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history } = req.body;
    let apiKey = process.env.GEMINI_API_KEY;
    const backupKey = process.env.GEMINI_API_KEY_BACKUP;
    
    if (!apiKey) {
      if (backupKey) {
        apiKey = backupKey;
      } else {
        return res.status(500).json({ error: "AI Studio 설정(좌측 열쇠 아이콘)에서 GEMINI_API_KEY를 입력해주세요." });
      }
    }

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

    const generateWithKey = async (key: string) => {
      const ai = new GoogleGenAI({ apiKey: key });
      return await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });
    };

    try {
      const response = await generateWithKey(apiKey);
      return res.status(200).json({ text: response.text });
    } catch (primaryError: any) {
      const isQuotaError = primaryError.status === 429 || primaryError.message?.includes("429") || primaryError.message?.includes("Quota");
      
      if (isQuotaError && backupKey && backupKey !== apiKey) {
        try {
          console.log("Primary key quota exceeded, using backup key...");
          const backupResponse = await generateWithKey(backupKey);
          return res.status(200).json({ text: backupResponse.text });
        } catch (backupError: any) {
          console.error("Backup key also failed:", backupError);
          const isBackupQuotaError = backupError.status === 429 || backupError.message?.includes("429") || backupError.message?.includes("Quota");
          if (isBackupQuotaError) {
             return res.status(429).json({ error: "무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요." });
          }
          throw backupError;
        }
      } else if (isQuotaError) {
        return res.status(429).json({ error: "무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요." });
      } else {
        throw primaryError;
      }
    }
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "AI가 응답하지 못했습니다. API 키가 정확한지 확인해주세요." });
  }
}
