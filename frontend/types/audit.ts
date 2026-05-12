export type AuditEvent = {
  id: number;
  event_type: string;
  message: string;
  metadata: Record<string, unknown>;
  created_at: string;
};
