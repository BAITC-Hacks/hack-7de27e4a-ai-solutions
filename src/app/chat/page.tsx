import { ChatWorkspace } from "@/components/chat/ChatWorkspace";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{
    skill?: string | string[];
    mentor?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return (
    <ChatWorkspace
      initialSkill={typeof query.skill === "string" ? query.skill : undefined}
      initialMentor={
        typeof query.mentor === "string" ? query.mentor : undefined
      }
    />
  );
}
