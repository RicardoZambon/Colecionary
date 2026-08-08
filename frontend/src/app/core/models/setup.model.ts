/** Mirrors the backend first-run setup contract (Vault.Api/Setup). */

export interface SetupStatus {
  configured: boolean;
  lastError: string | null;
}

export interface SetupConnection {
  server: string;
  port: number;
  database: string;
  username: string;
  password: string;
  trustServerCertificate: boolean;
}

export type SetupTestResult =
  | 'Success'
  | 'DatabaseMissingButCanBeCreated'
  | 'DatabaseMissingAndCannotCreate'
  | 'LoginRejected'
  | 'HostUnreachable'
  | 'Unknown';

export interface SetupApplyPayload extends SetupConnection {
  token: string;
  organizationName: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  defaultTheme: string | null;
}
