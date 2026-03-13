export interface TokenData {
  access_token: string;
  refresh_token?: string | null;
  client_id?: string | null;
  client_secret?: string | null;
  code_verifier?: string | null;
  token_type?: string;
  expires_at?: Date | null;
  scopes?: string | null;
  token_uri?: string | null;
}

export interface TokenMetadata {
  provider: string;
  token_type: string;
  expires_at: Date | null;
  scopes: string | null;
  is_expired: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface StoreTokenInput {
  access_token: string;
  refresh_token?: string;
  client_id?: string;
  client_secret?: string;
  code_verifier?: string;
  token_type?: string;
  expires_at?: string;
  scopes?: string;
  token_uri?: string;
}

export interface GoogleOAuthStartInput {
  customer_id: string;
  scopes: string[];
  redirect_uri?: string;
}

export interface ServiceAuthPayload {
  serviceName: string;
}

export type AuditAction =
  | "token_stored"
  | "token_retrieved"
  | "token_deleted"
  | "token_refreshed"
  | "oauth_started"
  | "oauth_completed";
