-- Add bundle product configuration fields to Product
ALTER TABLE "Product" ADD COLUMN "isBundleProduct" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "bundleSize" DOUBLE PRECISION;
ALTER TABLE "Product" ADD COLUMN "subUnit" TEXT;

-- Add display quantity fields to TransactionItem
ALTER TABLE "TransactionItem" ADD COLUMN "bundlesQty" DOUBLE PRECISION;
ALTER TABLE "TransactionItem" ADD COLUMN "kgQty" DOUBLE PRECISION;
