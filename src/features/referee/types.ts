/** Shared domain types for the referee conversation. */
type ChatFile = {
  url: string;
  key: string;
  name?: string;
  base64?: string;
};

export type ChatMessage = {
  role: 'user' | 'model';
  text: string;
  files?: ChatFile[];
  isProgress?: boolean;
  /** WhatsApp-style quoted context attached to a follow-up question. */
  quote?: string;
};

export type RulebookFile = { name: string; url: string };
export type DeviceType = 'mobile' | 'desktop' | 'tablet';
