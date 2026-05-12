export type InviteRecipientStatus = "PREVIEW" | "SENT" | "FAILED";

export type GameInvitesMode = "preview" | "sent";

export type GameInviteRecipient = {
  email: string;
  invite_status: InviteRecipientStatus;
};

export type SendGameInvitesPayload = {
  participant_emails: string[];
  teams_join_url: string;
  scheduled_start_time?: string | null;
};

export type GameInvitesResult = {
  mode: GameInvitesMode;
  game_id: string;
  room_code: string;
  bingo_join_url: string;
  teams_join_url: string;
  recipients: GameInviteRecipient[];
  subject: string;
  body_preview: string;
};
