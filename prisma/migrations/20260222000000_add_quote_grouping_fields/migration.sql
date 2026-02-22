-- AlterTable
ALTER TABLE "price_contracts" ADD COLUMN "quote_core" TEXT;
ALTER TABLE "price_contracts" ADD COLUMN "quote_year" INTEGER;
ALTER TABLE "price_contracts" ADD COLUMN "quote_prefix" TEXT;
ALTER TABLE "price_contracts" ADD COLUMN "quote_revision" TEXT;

-- CreateIndex
CREATE INDEX "price_contracts_quote_core_quote_year_idx" ON "price_contracts"("quote_core", "quote_year");
