-- Set database-level default for unitPrice so it matches the Prisma schema
ALTER TABLE "Product" ALTER COLUMN "unitPrice" SET DEFAULT 0;
