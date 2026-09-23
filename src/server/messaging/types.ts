export type ThreadStatus = "open" | "accepted" | "declined" | "closed";
export interface Message {
  id: string;
  threadId: string;
  authorId: string;
  text: string;
  sentAt: string;
  readBy: string[];
}
export interface ThreadSummary {
  id: string;
  skillId: string;
  requesterId: string;
  mentorId: string;
  subject: string;
  status: ThreadStatus;
  createdAt: string;
  lastMessageAt: string;
  unreadCount: number;
  other: { employeeId: string; fullName: string; role: string; grade: string };
}
export interface MessagingSummary {
  threadCount: number;
  messageCount: number;
  openCount: number;
  acceptedCount: number;
  declinedCount: number;
  closedCount: number;
  availableMentorCount: number;
}
export interface MentorshipCatalog {
  skills: { id: string; name: string }[];
  criticalGaps: {
    skillId: string;
    currentLevel: number;
    requiredLevel: number;
    gap: number;
  }[];
  departments: string[];
  roles: string[];
  available: boolean;
}
