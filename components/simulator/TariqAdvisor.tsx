'use client';

/**
 * TariqAdvisor — Streaming AI advisor chat panel.
 *
 * Calls POST /api/advisor → receives SSE stream → renders token-by-token.
 * Maintains conversation history (last 10 turns) in local state.
 * Rate limit: 10/hour. Credit cost: 2 credits/call.
 * Shows GCC context suggestions when input is empty.
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Zap, AlertCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const SUGGESTED_QUESTIONS = [
  'How is our Q1 performance tracking vs target?',
  'What should I prioritize this month?',
  'Assess our Ramadan readiness',
  'What are our biggest risk exposures?',
  'How do we improve fill rate fastest?',
];

interface TariqAdvisorProps {
  sessionId: string;
  currentMonth: number;
}

export function TariqAdvisor({ sessionId, currentMonth }: TariqAdvisorProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const sendMessage = async (question: string) => {
    if (!question.trim() || streaming) return;

    const userMessage: Message = {
      role: 'user',
      content: question.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setError(null);

    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          question: question.trim(),
          history,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? 'Tariq is unavailable right now.');
      }

      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullContent += parsed.text;
              setStreamingContent(fullContent);
            }
          } catch {
            // Ignore parse errors in stream chunks
          }
        }
      }

      // Commit streamed message
      const assistantMessage: Message = {
        role: 'assistant',
        content: fullContent,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setStreamingContent('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStreaming(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="rounded-xl border border-[#1e1e3a] bg-[#0d0d1a] flex flex-col" style={{ height: '420px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e3a] flex-shrink-0">
        <div className="w-7 h-7 rounded-lg bg-amber-400/10 flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div>
          <div className="text-sm font-semibold text-white">Tariq Al-Rashidi</div>
          <div className="text-[11px] text-slate-500">Chief Strategy Advisor • Month {currentMonth}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[11px] text-slate-500">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streaming && (
          <div className="space-y-3">
            <p className="text-slate-500 text-sm">
              Tariq is ready to advise. Ask about strategy, KPIs, or GCC market conditions.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm ${
                msg.role === 'user'
                  ? 'bg-amber-500/10 text-amber-100 border border-amber-500/20'
                  : 'bg-[#131325] text-slate-200 border border-[#1e1e3a]'
              }`}
            >
              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              <div className="text-[10px] text-slate-600 mt-1.5">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {/* Streaming message */}
        {streaming && streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] rounded-xl px-4 py-2.5 text-sm bg-[#131325] text-slate-200 border border-[#1e1e3a]">
              <p className="whitespace-pre-wrap leading-relaxed">{streamingContent}</p>
              <span className="inline-block w-0.5 h-4 bg-amber-400 animate-pulse ml-0.5 align-text-bottom" />
            </div>
          </div>
        )}

        {/* Loading dots */}
        {streaming && !streamingContent && (
          <div className="flex justify-start">
            <div className="rounded-xl px-4 py-3 bg-[#131325] border border-[#1e1e3a]">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-amber-400"
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="p-3 border-t border-[#1e1e3a] flex-shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Tariq about strategy, KPIs, or GCC market conditions..."
            rows={2}
            disabled={streaming}
            className="flex-1 bg-[#08080f] border border-[#1e1e3a] rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 resize-none focus:outline-none focus:border-amber-500/50 transition-colors disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming}
            className={`px-3 rounded-lg transition-all self-end ${
              input.trim() && !streaming
                ? 'bg-amber-500 hover:bg-amber-400 text-black'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            }`}
          >
            {streaming ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <div className="mt-1.5 text-[10px] text-slate-700 flex items-center gap-1">
          <span>↵ to send • Shift+↵ for new line • Rate limited: 10/hour</span>
        </div>
      </div>
    </div>
  );
}
