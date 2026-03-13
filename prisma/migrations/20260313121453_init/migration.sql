-- CreateTable
CREATE TABLE "tokens" (
    "id" UUID NOT NULL,
    "customer_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "client_id" TEXT,
    "client_secret" TEXT,
    "code_verifier" TEXT,
    "token_type" TEXT NOT NULL DEFAULT 'Bearer',
    "expires_at" TIMESTAMPTZ,
    "scopes" TEXT,
    "token_uri" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_pending_states" (
    "state" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "redirect_uri" TEXT,
    "code_verifier" TEXT,
    "scopes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "oauth_pending_states_pkey" PRIMARY KEY ("state")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "customer_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "caller_service" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tokens_customer_id_idx" ON "tokens"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "tokens_customer_id_provider_key" ON "tokens"("customer_id", "provider");

-- CreateIndex
CREATE INDEX "audit_logs_customer_id_idx" ON "audit_logs"("customer_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
