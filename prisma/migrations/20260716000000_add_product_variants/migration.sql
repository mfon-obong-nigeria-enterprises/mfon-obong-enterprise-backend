-- AlterTable: add hasVariants to Product (unitPrice made optional for variant products)
ALTER TABLE "Product" ADD COLUMN "hasVariants" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: ProductVariant
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "minStockLevel" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- AlterTable: add variantId and variantName to TransactionItem
ALTER TABLE "TransactionItem" ADD COLUMN "variantId" TEXT,
ADD COLUMN "variantName" TEXT;

-- AddForeignKey: ProductVariant -> Product
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: TransactionItem -> ProductVariant
ALTER TABLE "TransactionItem" ADD CONSTRAINT "TransactionItem_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
