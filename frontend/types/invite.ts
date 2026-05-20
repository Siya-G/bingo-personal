export type InviteRecipientStatus = "PREVIEW" | "SENT" | "FAILED";

export type GameInvitesMode = "preview" | "sent";

export type GameInviteRecipient = {
  email: string;
  invite_status: InviteRecipientStatus;
  error_message?: string | null;
  sent_at?: string | null;
};

export type SendGameInvitesPayload = {
  participant_emails: string[];
  teams_join_url: string;
  scheduled_start_time?: string | null;
};

export type GameInvitesResult = {
  mode: GameInvitesMode;
  /** True when the backend has real SMTP credentials and attempted live sends. */
  smtp_configured: boolean;
  smtp_host?: string | null;
  sent_count: number;
  failed_count: number;
  game_id: string;
  room_code: string;
  bingo_join_url: string;
  teams_join_url: string;
  recipients: GameInviteRecipient[];
  subject: string;
  body_preview: string;
};

export type SmtpHealth = {
  configured: boolean;
  host: string | null;
  port: number | null;
  use_tls: boolean;
  use_ssl: boolean;
  has_credentials: boolean;
  mode: "smtp" | "preview";
};
