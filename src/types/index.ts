export interface TokenData {
  accessToken: string;
  refreshToken?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  codeVerifier?: string | null;
  tokenType?: string;
  expiresAt?: Date | null;
  scopes?: string | null;
  tokenUri?: string | null;
}

export interface TokenMetadata {
  provider: string;
  tokenType: string;
  expiresAt: Date | null;
  scopes: string | null;
  isExpired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreTokenInput {
  accessToken: string;
  refreshToken?: string;
  clientId?: string;
  clientSecret?: string;
  codeVerifier?: string;
  tokenType?: string;
  expiresAt?: string;
  scopes?: string;
  tokenUri?: string;
}

export interface GoogleOAuthStartInput {
  customerId: string;
  scopes: string[];
  redirectUri?: string;
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
