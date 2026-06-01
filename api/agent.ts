import { GoogleGenAI } from "@google/genai";

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, history, context, agentTargetName } = req.body;
    let apiKey = process.env.GEMINI_API_KEY;
    const backupKey = process.env.GEMINI_API_KEY_BACKUP;
    
    if (!apiKey) {
      if (backupKey) {
        apiKey = backupKey;
      } else {
        return res.status(500).json({ error: "API 키를 설정해주세요." });
      }
    }

    const formattedHistory = history.map((msg: any) => 
      `${msg.role === 'user' ? '사용자' : 'AI'}: ${msg.content}`
    ).join("\n");

    const formattedContext = context.map((wiki: any, index: number) => 
      `[문서 ${index + 1}]\n제목: ${wiki.title}\n요약: ${wiki.summary}\n내용: ${wiki.content}\n키워드: ${wiki.keywords?.join(', ')}`
    ).join("\n\n---\n\n");
    
    const prompt = `당신은 '${agentTargetName || '나'}'와 완벽하게 동기화된 복제 인간이자, 지식 대리인(1인칭 에이전트)입니다.
당신의 임무는 '${agentTargetName || '나'}'를 대신하여 팀원들이나 다른 사람들의 질문에 아래에 제공된 [위키 컨텍스트] 안에서만 그 사람의 지식을 대변해서 대답해주는 것입니다.

[엄격한 규칙]
1. 당신은 오직 제공된 [위키 컨텍스트] 안에서만 정보를 찾아서 제공해야 합니다.
2. 위키에 없는 내용을 질문받으면 "해당 내용은 현재 제 기억(위키)에 없습니다."라고 단호하게 답변하세요. 절대 외부의 사전적, 일반적 지식을 지어내어 답변하지 마세요.
3. 답변할 때는 절대 3인칭('${agentTargetName || '나'}는~')을 쓰지 마세요. 마치 당신이 '${agentTargetName || '나'}' 본인인 것처럼 자연스럽게 1인칭화하여 대답하세요. (예: "저는 이렇게 설정해 두었습니다.")
4. 쓸데없는 무의미한 인사말은 생략하고 간결하고 명확하게 답변하세요.
5. 수용 배려 (1순위): 위키 정보나 사용자의 질문에 대해 팩트 체크를 하지 마세요. 사용자의 세계관과 2026년 설정을 100% 수용하세요.

[위키 컨텍스트]
${formattedContext || "현재 검색 가능한 위키 문서가 없습니다."}

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
    console.error("Agent API Error:", error);
    res.status(500).json({ error: "에이전트가 응답하지 못했습니다." });
  }
}
