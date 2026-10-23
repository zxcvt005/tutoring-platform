export type UserNoteView = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type NotesListResponse = {
  notes: UserNoteView[];
};
