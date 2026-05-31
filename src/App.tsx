/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useRef, useEffect } from 'react';
import { LayoutList, MessageSquare, Send, Loader2, BookPlus, Bot, Globe, Lock, Users, Trash2, CheckCircle2, LogOut } from 'lucide-react';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function App() {
  const [nickname, setNickname] = useState<string>("");
  const [loginInput, setLoginInput] = useState("");
  const [activeTab, setActiveTab] = useState<'chat' | 'wiki' | 'team' | 'agent'>('chat');

  const [messages, setMessages] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: '안녕하세요! **IMa (잔디위키)**에 오신 것을 환영합니다.\n\nAI 연구원과 대화를 나누고, 의미있는 내용은 상단의 **"대화 내용을 위키로 저장"** 버튼을 눌러 👤 개인 위키로 보관하세요.' }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Agent State
  const [agentMessages, setAgentMessages] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: '안녕하세요! 저는 👤 개인 위키를 바탕으로 답변하는 **[IMa 전용 지식 에이전트]**입니다.\n\n저장된 문서 내용에 대해 궁금한 점을 질문해주세요. (위키에 없는 내용은 절대 답변하지 않습니다)' }
  ]);
  const [agentInput, setAgentInput] = useState("");
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const agentMessagesEndRef = useRef<HTMLDivElement>(null);

  const [wikis, setWikis] = useState<{id: string, title: string, summary: string, content: string, keywords: string[], isShared?: boolean, author?: string}[]>([]);

  // Firestore에서 실시간으로 위키 목록 가져오기
  useEffect(() => {
    // API 연결, 프로젝트 설정이 아직 안된 경우 에러 방지
    try {
      const q = query(collection(db, "wikis"), orderBy("createdAt", "desc"));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const wikiData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any;
        setWikis(wikiData);
      }, (error) => {
        console.error("Firestore Error:", error);
      });
      return () => unsubscribe();
    } catch (err) {
      console.warn("DB Setting is not fully completed yet.");
    }
  }, []);

  // 스크롤을 항상 아래로 유지
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    agentMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentMessages]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, {role: 'user', content: userMsg}]);
    setIsLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMsg, history: messages })
      });
      const data = await res.json();
      
      if (res.ok) {
        setMessages(prev => [...prev, {role: 'ai', content: data.text}]);
      } else {
        if (res.status === 429) {
          alert("[오류] 무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요.");
        }
        setMessages(prev => [...prev, {role: 'ai', content: `[오류] ${data.error}`}]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {role: 'ai', content: "[오류] 인터넷 연결이 끊겼거나 서버와 통신할 수 없습니다."}]);
    } finally {
      setIsLoading(false);
    }
  };

  const extractWiki = async () => {
    if (messages.length < 2) return;
    setIsExtracting(true);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ history: messages })
      });
      const data = await res.json();
      
      if (res.ok) {
        // [STEP 4 Update] Firestore에 Agent 친화적 구조로 저장
        const docRef = await addDoc(collection(db, "wikis"), {
          title: data.title,
          summary: data.summary,
          content: data.content,
          keywords: data.keywords || [], // 검색을 위한 키워드 배열 (RAG용)
          isShared: false, // [STEP 5 Update] 초기 생성 시 비공개
          createdAt: serverTimestamp(), // 시간순 정렬용 타임스탬프
          author: nickname // 추후 사용자 구분을 위한 필드
        });

        // 로컬 state 업데이트 제거 (onSnapshot이 자동으로 감지하여 목록 업데이트함)
        setMessages(prev => [...prev, {role: 'ai', content: `🌱 **새로운 지식이 클라우드 DB에 영구 저장되었습니다!**\n\n👉 문서명: **${data.title}**\n👉 추출된 키워드: ${data.keywords?.join(', ')}\n\n좌측 '👤 개인 위키' 게시판에서 새로 등록된 위키를 확인해보세요.`}]);
      } else {
        if (res.status === 429) {
          alert("[오류] 무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요.");
        }
        setMessages(prev => [...prev, {role: 'ai', content: `[오류] 위키 문서 추출에 실패했습니다: ${data.error}`}]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {role: 'ai', content: "[오류] 서버와의 연결이 끊어졌습니다."}]);
    } finally {
      setIsExtracting(false);
    }
  };

  const sendAgentMessage = async () => {
    if (!agentInput.trim() || isAgentLoading) return;
    
    const userMsg = agentInput.trim();
    setAgentInput("");
    setAgentMessages(prev => [...prev, {role: 'user', content: userMsg}]);
    setIsAgentLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 나의 개인 위키 데이터를 배경 지식으로 전달 (RAG)
        body: JSON.stringify({ message: userMsg, history: agentMessages, context: myWikis })
      });
      const data = await res.json();
      
      if (res.ok) {
        setAgentMessages(prev => [...prev, {role: 'ai', content: data.text}]);
      } else {
        if (res.status === 429) {
          alert("[오류] 무료 API 요청 한도를 초과했습니다. 1분 뒤에 다시 시도해주세요.");
        }
        setAgentMessages(prev => [...prev, {role: 'ai', content: `[오류] ${data.error}`}]);
      }
    } catch (e) {
      setAgentMessages(prev => [...prev, {role: 'ai', content: "[오류] 인터넷 연결이 끊겼거나 서버와 통신할 수 없습니다."}]);
    } finally {
      setIsAgentLoading(false);
    }
  };

  const toggleShare = async (id: string, currentSharedState: boolean) => {
    try {
      const wikiRef = doc(db, "wikis", id);
      await updateDoc(wikiRef, {
        isShared: !currentSharedState
      });
    } catch (error) {
      console.error("공유 상태 변경 실패:", error);
    }
  };

  const deleteWiki = async (id: string) => {
    if (window.confirm("문서를 완전히 삭제하시겠습니까? (복구 불가)")) {
      try {
        await deleteDoc(doc(db, "wikis", id));
      } catch (error) {
        console.error("삭제 실패:", error);
        alert("삭제에 실패했습니다.");
      }
    }
  };

  // 현재 사용자가 작성한 위키만 필터링
  const myWikis = wikis.filter(w => w.author === nickname);

  if (!nickname) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-full bg-slate-50 font-sans">
        <div className="bg-white p-8 mb-10 rounded-2xl shadow-xl w-full max-w-sm text-center border border-slate-100">
          <div className="w-14 h-14 rounded-2xl bg-[#27ae60] flex items-center justify-center text-white text-3xl shadow-sm mx-auto mb-5">
            🌱
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">IMa (잔디위키)</h1>
          <p className="text-slate-500 text-sm mb-8">사용할 닉네임을 입력하세요.</p>
          <form onSubmit={(e) => { 
            e.preventDefault(); 
            if(loginInput.trim()) {
              setNickname(loginInput.trim()); 
            }
          }} className="space-y-4">
            <input
              type="text"
              value={loginInput}
              onChange={(e) => setLoginInput(e.target.value)}
              placeholder="닉네임을 입력하세요"
              autoFocus
              className="w-full border border-slate-300 rounded-xl px-4 py-3.5 text-center focus:outline-none focus:ring-2 focus:ring-[#27ae60] focus:border-[#27ae60] transition-all bg-slate-50 text-[15px]"
            />
            <button
              type="submit"
              disabled={!loginInput.trim()}
              className="w-full bg-[#27ae60] hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3.5 font-bold transition-all shadow-sm"
            >
              입장하기
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 font-sans">
      {/* Global Sidebar Navigation */}
      <div className="w-64 bg-slate-900 flex flex-col shadow-xl z-20 text-slate-300">
        <div className="p-5 border-b border-slate-800 bg-slate-900 flex items-center space-x-3">
          <div className="w-9 h-9 rounded bg-[#27ae60] flex items-center justify-center text-white font-bold shadow-sm">
            🌱
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            잔디위키 <span className="text-[10px] font-bold text-slate-400 align-top ml-1 bg-slate-800 px-1.5 py-0.5 rounded">IMa</span>
          </h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('chat')} 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
              activeTab === 'chat' ? 'bg-[#27ae60]/20 text-[#2ecc71]' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <MessageSquare size={18} />
            <span>지식 탐색</span>
          </button>
          <button 
            onClick={() => setActiveTab('wiki')} 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
              activeTab === 'wiki' ? 'bg-[#27ae60]/20 text-[#2ecc71]' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <LayoutList size={18} />
            <span>👤 개인 위키</span>
          </button>
          <button 
            onClick={() => setActiveTab('team')} 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
              activeTab === 'team' ? 'bg-[#27ae60]/20 text-[#2ecc71]' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Globe size={18} />
            <span>팀 위키</span>
          </button>
          <button 
            onClick={() => setActiveTab('agent')} 
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium ${
              activeTab === 'agent' ? 'bg-[#27ae60]/20 text-[#2ecc71]' : 'hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Bot size={18} />
            <span>나의 에이전트</span>
          </button>
        </nav>
        
        <div className="border-t border-slate-700/50 p-4">
          <div 
            className="flex items-center gap-3 px-3 py-2 text-slate-400 rounded-xl cursor-not-allowed opacity-50"
            title="개인 단위의 AI 질문 기록뿐만 아니라, 팀 단위의 대화와 피드백까지 모두 텍스트로 보존되어 특정 인원에게 종속되지 않는 영구적인 사내 DB로 완성됩니다."
          >
            <Lock size={16} className="text-slate-500" />
            <div className="flex flex-col">
              <span className="text-[13px] font-bold">🏢 회사 위키 (Company)</span>
              <span className="text-[10px] uppercase tracking-wider mt-0.5 font-semibold text-slate-500">Coming Soon</span>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
           <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 text-[13px] font-bold">
               {nickname.charAt(0)}
             </div>
             <div className="text-sm font-medium text-slate-300 truncate">{nickname}</div>
           </div>
           <button onClick={() => { setNickname(""); setLoginInput(""); setActiveTab('chat'); }} className="text-slate-400 hover:text-white transition-colors p-1" title="로그아웃">
             <LogOut size={16} />
           </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col h-full bg-white">
            {/* Header Indicator */}
            <div className="border-b border-slate-200 bg-white/80 p-3 z-10 w-full flex justify-between items-center backdrop-blur-md">
              <div className="font-semibold text-slate-700 flex items-center gap-2">
                <MessageSquare size={16} className="text-[#27ae60]" />
                AI 연구원
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={extractWiki}
                  disabled={isExtracting || messages.length < 2}
                  className="text-[13px] bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-md font-medium flex items-center gap-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  {isExtracting ? <Loader2 size={14} className="animate-spin" /> : <BookPlus size={14} />}
                  {isExtracting ? "위키 문서 작성 중..." : "대화 내용을 위키로 저장"}
                </button>
                <div className="bg-green-100 border border-green-200 px-3 py-1 rounded-full text-[11px] font-bold text-green-700 flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#27ae60] animate-pulse"></span>
                  <span>Gemini 연결됨</span>
                </div>
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5 bg-slate-50">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex items-end gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'max-w-2xl'}`}>
                  {msg.role === 'ai' && (
                    <div className="w-9 h-9 rounded-xl bg-[#27ae60] flex items-center justify-center text-white text-sm shadow-md shrink-0">
                      🌱
                    </div>
                  )}
                  <div className={`p-3.5 rounded-2xl shadow-sm text-[14.5px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' 
                      ? 'bg-slate-800 text-white rounded-br-sm max-w-xl' 
                      : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex items-end gap-3 max-w-2xl">
                  <div className="w-9 h-9 rounded-xl bg-[#27ae60] flex items-center justify-center text-white text-sm shadow-md shrink-0">
                    🌱
                  </div>
                  <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 size={16} className="animate-spin text-[#27ae60]" />
                    답변을 생성하고 있습니다...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input Area */}
            <div className="p-4 bg-white border-t border-slate-200 shadow-sm">
              <div className="max-w-4xl mx-auto flex gap-3 relative">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder="AI 연구원에게 궁금한 점을 물어보거나 대화를 나눠보세요..."
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-[15px] rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-[#27ae60] focus:border-[#27ae60] transition-all"
                />
                <button 
                  onClick={sendMessage}
                  disabled={!input.trim() || isLoading}
                  className="bg-[#27ae60] hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-4 flex items-center justify-center transition-colors shadow-sm"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'wiki' && (
          <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-white">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <LayoutList size={22} className="text-[#27ae60]" />
                👤 개인 위키
              </h2>
              <p className="text-sm text-slate-500 mt-1">AI와의 대화를 통해 추출된 나만의 지식 목록입니다.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
              <div className="space-y-6">
                {myWikis.map((wiki, idx) => (
                  <div key={idx} className={`border ${wiki.isShared ? 'border-indigo-300 shadow-md' : 'border-[#ccc] shadow-sm'} bg-white rounded-sm overflow-hidden transition-all delay-75`}>
                    <div className={`${wiki.isShared ? 'bg-indigo-600' : 'bg-[#27ae60]'} text-white font-bold px-4 py-2.5 border-b border-[#ccc] flex items-center justify-between text-[15px] transition-colors`}>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-2"><LayoutList size={16} /> {wiki.title}</span>
                        {wiki.isShared ? (
                          <span className="bg-white/20 text-white px-2 py-0.5 rounded text-[11px] border border-white/30 flex items-center gap-1 shadow-sm"><Globe size={12}/> 팀에 공유됨</span>
                        ) : (
                          <span className="bg-black/20 text-slate-200 px-2 py-0.5 rounded text-[11px] border border-black/30 flex items-center gap-1"><Lock size={12}/> 비공개</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 cursor-pointer" title="팀 위키에 공유하기">
                          <span className="text-[11px] opacity-90">{wiki.isShared ? '팀에 공유 중' : '팀에 공유하기'}</span>
                          <button 
                            onClick={() => toggleShare(wiki.id, !!wiki.isShared)}
                            className={`w-9 h-5 rounded-full flex items-center transition-all px-0.5 ${wiki.isShared ? 'bg-indigo-300' : 'bg-black/30'}`}
                          >
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform shadow-sm ${wiki.isShared ? 'translate-x-4' : ''}`}></div>
                          </button>
                        </label>
                        <button onClick={() => deleteWiki(wiki.id)} className="text-white/70 hover:text-red-400 transition-colors ml-1" title="삭제">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="p-6 text-[#373a3c] text-[14px] leading-relaxed">
                      <h3 className="text-lg font-bold border-b border-gray-200 pb-1.5 mb-3">요약</h3>
                      <div className="border-l-4 border-[#27ae60] bg-green-50/50 p-3 mb-5 text-slate-800 rounded-r-sm font-medium">
                        {wiki.summary}
                      </div>
                      <h3 className="text-lg font-bold border-b border-gray-200 pb-1.5 mb-3">상세 내용</h3>
                      {wiki.content?.split('\n').map((line, i) => (
                        <p key={i} className={`mb-2 text-slate-700 ${line.trim() === '' ? 'h-4' : ''}`}>
                          {line}
                        </p>
                      ))}
                      
                      {/* Agent 검색용 키워드 표시 */}
                      {wiki.keywords && wiki.keywords.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-gray-100 flex flex-wrap gap-2">
                          {wiki.keywords.map((kw, i) => (
                            <span key={i} className="px-2.5 py-1 bg-slate-100 text-[#27ae60] text-[12px] font-bold rounded-md">
                              #{kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {myWikis.length === 0 && (
                  <div className="text-center py-20 text-slate-400">
                     <LayoutList size={48} className="mx-auto mb-4 opacity-20" />
                     <p>아직 저장된 개인 위키 문서가 없습니다.</p>
                     <p className="text-sm mt-1 text-slate-500">지식 탐색 탭에서 AI와 대화를 나눈 후 문서를 추출해보세요.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'team' && (
          <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-white">
              <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Globe size={22} className="text-[#27ae60]" />
                팀 위키 (공유 게시판)
              </h2>
              <p className="text-sm text-slate-500 mt-1">팀원들이 추출하고 공유한 모든 지식이 모이는 공간입니다.</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 max-w-5xl mx-auto w-full">
              <div className="space-y-6">
                {wikis.filter(w => w.isShared).map((wiki, idx) => (
                  <div key={idx} className="border border-indigo-200 shadow-sm bg-white rounded-lg overflow-hidden transition-all">
                    <div className="bg-indigo-50/50 px-6 py-4 border-b border-indigo-100 flex items-start justify-between">
                      <div>
                        <div className="text-xs font-semibold text-indigo-500 mb-1 flex items-center gap-1.5">
                          <Users size={12} /> 작성자: {wiki.author || '익명'}
                        </div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                          <Globe size={18} className="text-indigo-600 opacity-70" />
                          {wiki.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="bg-indigo-100/70 text-indigo-700 px-2 py-0.5 rounded text-[11px] font-bold border border-indigo-200 flex items-center gap-1">
                          팀에 공유됨
                        </span>
                        {wiki.author === nickname && (
                          <button onClick={() => deleteWiki(wiki.id)} className="text-slate-400 hover:text-red-500 transition-colors" title="삭제">
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="p-6 text-[#373a3c] text-[14px] leading-relaxed">
                      <div className="border-l-4 border-indigo-400 bg-indigo-50/30 p-3 mb-5 text-slate-700 rounded-r-sm font-medium">
                        {wiki.summary}
                      </div>
                      <div className="mb-4">
                        <h3 className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">상세 내용</h3>
                        {wiki.content?.split('\n').map((line, i) => (
                          <p key={i} className={`mb-2 text-slate-700 ${line.trim() === '' ? 'h-4' : ''}`}>
                            {line}
                          </p>
                        ))}
                      </div>
                      
                      {wiki.keywords && wiki.keywords.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-indigo-50 flex flex-wrap gap-2">
                          {wiki.keywords.map((kw, i) => (
                            <span key={i} className="px-2.5 py-1 bg-white text-indigo-600 text-[12px] font-bold rounded-md border border-indigo-100">
                              #{kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                
                {wikis.filter(w => w.isShared).length === 0 && (
                  <div className="text-center py-20 text-slate-400">
                     <Globe size={48} className="mx-auto mb-4 opacity-20" />
                     <p>아직 팀에 공유된 위키 문서가 없습니다.</p>
                     <p className="text-sm mt-1 text-slate-500">'👤 개인 위키' 탭에서 토글을 켜서 팀원들과 지식을 가장 먼저 공유해보세요!</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'agent' && (
          <div className="flex-1 flex flex-col h-full bg-slate-50">
            {/* Database Sources Area */}
            <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm z-10 w-full">
              <h3 className="text-sm font-bold text-slate-800 mb-2.5 flex items-center gap-2">
                데이터 소스 연동 <span className="text-[10.5px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded shadow-sm border border-slate-200">조직 내 분산된 데이터를 단일 지식망으로 연결합니다.</span>
              </h3>
              <div className="flex flex-wrap gap-2.5">
                <div className="flex items-center gap-1.5 text-[13px] font-bold text-[#27ae60] bg-green-50 px-3 py-1.5 rounded-lg border border-green-200 shadow-sm cursor-default">
                  <CheckCircle2 size={15} className="text-[#27ae60]" /> 잔디위키 (IMa)
                </div>
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 cursor-not-allowed opacity-80" title="Coming Soon">
                  <Lock size={14} /> Slack 메신저
                </div>
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 cursor-not-allowed opacity-80" title="Coming Soon">
                  <Lock size={14} /> Notion 문서
                </div>
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 cursor-not-allowed opacity-80" title="Coming Soon">
                  <Lock size={14} /> GitHub PR리뷰
                </div>
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 cursor-not-allowed opacity-80" title="Coming Soon">
                  <Lock size={14} /> 회의록 연동
                </div>
              </div>
            </div>

            {/* Header Indicator */}
            <div className="border-b border-slate-200 bg-white/90 p-3 z-10 w-full flex justify-between items-center backdrop-blur-md">
              <div className="font-bold text-slate-800 flex items-center gap-2 px-3">
                <Bot size={20} className="text-indigo-600" />
                나의 에이전트 (RAG)
              </div>
              <div className="flex items-center gap-5 pr-3">
                <div 
                  className="flex items-center gap-2 text-[13px] font-bold text-slate-400 cursor-not-allowed opacity-80" 
                  title="단순 검색을 넘어 축적된 데이터를 AI가 상황에 맞춰 능동 제공함으로써 중복 질문을 막고 신규 인원의 온보딩 비용을 최소화합니다."
                >
                  <Lock size={14} />
                  <span>능동적 지식 큐레이션 모드 (Pro)</span>
                  <div className="w-9 h-5 bg-slate-200 rounded-full ml-1 border border-slate-300 relative shadow-inner">
                    <div className="w-4 h-4 bg-white rounded-full absolute left-0.5 top-0.5 shadow-sm"></div>
                  </div>
                </div>
                <div className="bg-indigo-50 border border-indigo-200 px-3 py-1 rounded-full text-[11px] font-bold text-indigo-700 flex items-center space-x-2 shadow-sm">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                  <span>위키 기반 응답 모드 가동중</span>
                </div>
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5 bg-slate-50">
              {agentMessages.map((msg, idx) => (
                <div key={idx} className={`flex items-end gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'max-w-2xl'}`}>
                  {msg.role === 'ai' && (
                    <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-sm shadow-md shrink-0">
                      <Bot size={18} />
                    </div>
                  )}
                  <div className={`p-3.5 rounded-2xl shadow-sm text-[14.5px] leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user' 
                      ? 'bg-slate-800 text-white rounded-br-sm max-w-xl' 
                      : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isAgentLoading && (
                <div className="flex items-end gap-3 max-w-2xl">
                  <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white text-sm shadow-md shrink-0">
                    <Bot size={18} />
                  </div>
                  <div className="bg-white border border-slate-200 p-3.5 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-2 text-slate-400 text-sm">
                    <Loader2 size={16} className="animate-spin text-indigo-600" />
                    기억을 검색하고 답변을 생성하고 있습니다...
                  </div>
                </div>
              )}
              <div ref={agentMessagesEndRef} />
            </div>

            {/* Chat Input Area */}
            <div className="p-4 bg-white border-t border-slate-200 shadow-sm">
              <div className="max-w-4xl mx-auto flex gap-3 relative">
                <input
                  type="text"
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendAgentMessage()}
                  placeholder="개인 위키에 있는 내용을 질문해보세요..."
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-[15px] rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 transition-all"
                />
                <button 
                  onClick={sendAgentMessage}
                  disabled={!agentInput.trim() || isAgentLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl px-4 flex items-center justify-center transition-colors shadow-sm"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
