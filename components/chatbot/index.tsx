"use client";

import assert from "assert";

import { experimental_useObject as useObject } from "ai/react";
import { Rss } from "lucide-react";
import { Inter } from "next/font/google";
import { Fragment, useEffect, useMemo, useState } from "react";

import { conversationMessagesResponseSchema, GenerateRequest, GenerateResponseSchema } from "@/lib/schema";

import AssistantMessage from "./assistant-message";
import ChatInput from "./chat-input";
import { SourceMetadata } from "./types";

const inter = Inter({ subsets: ["latin"] });

type AiMessage = { content: string; role: "system"; id?: string; expanded: boolean; sources: SourceMetadata[] };
type UserMessage = { content: string; role: "user" };
type Message = AiMessage | UserMessage;

const UserMessage = ({ content }: { content: string }) => (
  <div className="mb-6 rounded-md px-4 py-2 self-end bg-[#F5F5F7]">{content}</div>
);

interface Props {
  conversationId: string;
  initialMessage?: string;
  onSelectedDocumentId: (id: string) => void;
}

export default function Chatbot({ conversationId, initialMessage, onSelectedDocumentId }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sourceCache, setSourceCache] = useState<Record<string, SourceMetadata[]>>({});
  const [pendingMessage, setPendingMessage] = useState<null | { id: string; expanded: boolean }>(null);

  const { isLoading, object, submit } = useObject({
    api: "/api/generate",
    schema: GenerateResponseSchema,
    fetch: async function middleware(input: RequestInfo | URL, init?: RequestInit) {
      const res = await fetch(input, init);
      const id = res.headers.get("x-message-id");
      const expanded = res.headers.get("x-expanded") ? true : false;

      assert(id);

      setPendingMessage({ id, expanded });
      return res;
    },
    onError: console.error,
    onFinish: (event) => {
      if (!event.object) return;

      const content = event.object.message;
      setMessages((prev) => [...prev, { content: content, role: "system", sources: [], expanded: false }]);
    },
  });

  const handleSubmit = (content: string) => {
    const payload: GenerateRequest = { conversationId, content };
    setMessages([...messages, { content, role: "user" }]);
    submit(payload);
  };

  useEffect(() => {
    if (!pendingMessage || isLoading) return;

    const copy = [...messages];
    const last = copy.pop();
    if (last?.role === "system") {
      setMessages([...copy, { ...last, id: pendingMessage.id, expanded: pendingMessage.expanded }]);
      setPendingMessage(null);
    }
  }, [pendingMessage, isLoading, messages]);

  useEffect(() => {
    if (!pendingMessage) return;

    (async () => {
      const res = await fetch(`/api/messages/${pendingMessage.id}`);
      if (!res.ok) return;

      const json = (await res.json()) as { id: string; sources: SourceMetadata[] };
      setSourceCache((prev) => ({ ...prev, [json.id]: json.sources }));
    })();
  }, [pendingMessage]);

  useEffect(() => {
    if (initialMessage) {
      handleSubmit(initialMessage);
    } else {
      (async () => {
        const res = await fetch(`/api/conversations/${conversationId}/messages`);
        if (!res.ok) throw new Error("Could not load conversation");
        const json = await res.json();
        const messages = conversationMessagesResponseSchema.parse(json);
        setMessages(messages);
      })();
    }
  }, []);

  const messagesWithSources = useMemo(
    () =>
      messages.map((m) =>
        m.role === "system" && m.id && sourceCache[m.id] ? { ...m, sources: sourceCache[m.id] } : m,
      ),
    [messages, sourceCache],
  );

  return (
    <div className="flex h-full w-full items-center flex-col">
      <div className="flex flex-col h-full w-full items-center overflow-y-auto">
        <div className="flex flex-col h-full w-full p-4 max-w-[717px]">
          {messagesWithSources.map((message, i) =>
            message.role === "user" ? (
              <UserMessage key={i} content={message.content} />
            ) : (
              <Fragment key={i}>
                <AssistantMessage
                  content={message.content}
                  id={message.id}
                  sources={message.sources}
                  onSelectedDocumentId={onSelectedDocumentId}
                />
                {i === messages.length - 1 && messages[i].role === "system" && !messages[i].expanded && (
                  <div className="flex justify-center">
                    <button
                      className="flex justify-center rounded-[20px] border px-4 py-2.5 mt-8"
                      onClick={() => handleSubmit("Tell me more about this")}
                    >
                      Tell me more about this
                    </button>
                  </div>
                )}
              </Fragment>
            ),
          )}
          {isLoading && (
            <AssistantMessage
              content={object?.message}
              id={pendingMessage?.id}
              sources={[]}
              onSelectedDocumentId={onSelectedDocumentId}
            />
          )}
        </div>
      </div>
      <div className="p-4 w-full flex justify-center max-w-[717px]">
        <div className="flex flex-col w-full p-2 pl-4 rounded-[24px] border border-[#D7D7D7]">
          <ChatInput handleSubmit={handleSubmit} />
        </div>
      </div>
    </div>
  );
}
