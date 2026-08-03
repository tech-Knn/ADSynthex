-- CreateTable
CREATE TABLE "feeds" (
    "feed_name" TEXT NOT NULL,
    "publisher_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feeds_pkey" PRIMARY KEY ("feed_name")
);

-- CreateTable
CREATE TABLE "accounts" (
    "cid" TEXT NOT NULL,
    "feed" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("cid")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "account_cid" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "name" TEXT,
    "status" TEXT,
    "country" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("account_cid","campaign_id")
);

-- CreateTable
CREATE TABLE "ads_daily" (
    "account_cid" TEXT NOT NULL,
    "campaign_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL DEFAULT '',
    "date" DATE NOT NULL,
    "cost_micros" BIGINT NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "conversions" DECIMAL(16,6) NOT NULL DEFAULT 0,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ads_daily_pkey" PRIMARY KEY ("account_cid","campaign_id","channel_id","date")
);

-- CreateTable
CREATE TABLE "adsense_daily" (
    "channel_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "country" TEXT NOT NULL DEFAULT '',
    "account_cid" TEXT,
    "earnings" DECIMAL(16,6) NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adsense_daily_pkey" PRIMARY KEY ("channel_id","date","country")
);

-- CreateIndex
CREATE INDEX "ads_daily_account_cid_date_idx" ON "ads_daily"("account_cid", "date");

-- CreateIndex
CREATE INDEX "ads_daily_channel_id_date_idx" ON "ads_daily"("channel_id", "date");

-- CreateIndex
CREATE INDEX "adsense_daily_date_idx" ON "adsense_daily"("date");

-- CreateIndex
CREATE INDEX "adsense_daily_account_cid_date_idx" ON "adsense_daily"("account_cid", "date");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_feed_fkey" FOREIGN KEY ("feed") REFERENCES "feeds"("feed_name") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_account_cid_fkey" FOREIGN KEY ("account_cid") REFERENCES "accounts"("cid") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_daily" ADD CONSTRAINT "ads_daily_account_cid_campaign_id_fkey" FOREIGN KEY ("account_cid", "campaign_id") REFERENCES "campaigns"("account_cid", "campaign_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adsense_daily" ADD CONSTRAINT "adsense_daily_account_cid_fkey" FOREIGN KEY ("account_cid") REFERENCES "accounts"("cid") ON DELETE SET NULL ON UPDATE CASCADE;
