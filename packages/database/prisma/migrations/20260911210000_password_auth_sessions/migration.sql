BEGIN;

CREATE TABLE "PasswordCredential" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PasswordCredential_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PasswordCredential_userId_key" ON "PasswordCredential"("userId");
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "AuthSession"("userId", "revokedAt");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

ALTER TABLE "PasswordCredential" ADD CONSTRAINT "PasswordCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;

ALTER TABLE public."PasswordCredential"
  ADD CONSTRAINT bizzres_password_hash_nonblank_check CHECK (btrim("passwordHash") <> '');

ALTER TABLE public."AuthSession"
  ADD CONSTRAINT bizzres_refresh_token_hash_check CHECK ("refreshTokenHash"::text COLLATE "C" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT bizzres_auth_session_expiry_check CHECK ("expiresAt" > "createdAt"),
  ADD CONSTRAINT bizzres_auth_session_revoked_at_check CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt"),
  ADD CONSTRAINT bizzres_auth_session_last_used_at_check CHECK ("lastUsedAt" IS NULL OR "lastUsedAt" >= "createdAt");

COMMIT;
