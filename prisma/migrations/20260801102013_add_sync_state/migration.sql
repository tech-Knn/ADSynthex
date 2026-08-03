-- CreateTable
CREATE TABLE "sync_state" (
    "feed_name" TEXT NOT NULL,
    "last_synced_date" DATE,
    "last_run_at" TIMESTAMPTZ(6),
    "status" TEXT,
    "message" TEXT,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("feed_name")
);
