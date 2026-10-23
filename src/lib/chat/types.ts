export type ChatSystemEventPayload = {
  eventType: string;
  title: string;
  lessonId?: string;
  assignmentId?: string;
  attendanceStatus?: string;
  topicTitle?: string;
  homeworkTitle?: string;
  theoryAssignmentId?: string;
  theoryTitle?: string;
  hrefStudent?: string | null;
  hrefTeacher?: string | null;
};

export type ChatMessageType = "user_message" | "system_event";

export type ChatAttachmentView = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  isImage: boolean;
  url: string;
};

export type ChatMessageView = {
  id: string;
  chatId: string;
  type: ChatMessageType;
  authorUserId: string | null;
  body: string | null;
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
  eventType: string | null;
  eventPayload: ChatSystemEventPayload | null;
  attachments: ChatAttachmentView[];
  clientRequestId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  mine: boolean;
};

export type ChatListItem = {
  id: string;
  studentId: string;
  teacherId: string;
  peerName: string;
  peerRole: "teacher" | "student";
  isCurrentPair: boolean;
  canSend: boolean;
  lastMessageAt: string | null;
  lastPreview: string | null;
  unreadCount: number;
};

export type ChatThreadMeta = ChatListItem & {
  studentName: string;
  teacherName: string;
};

export type ChatListResponse = {
  items: ChatListItem[];
  nextOffset: number | null;
  unreadTotal: number;
};

export type ChatMessagesResponse = {
  chat: ChatThreadMeta;
  messages: ChatMessageView[];
  hasMore: boolean;
  oldestCreatedAt: string | null;
};

export type ChatSendResult = {
  message: ChatMessageView;
  incomplete: boolean;
  attachmentErrors: { name: string; error: string }[];
};

export type ChatSummary = {
  unreadTotal: number;
  latestChatId: string | null;
  latestAt: string | null;
};
