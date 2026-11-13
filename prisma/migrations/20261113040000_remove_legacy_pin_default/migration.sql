-- Old Prisma db-push databases created manager PINs with a literal '1234'
-- column default. Removing the Prisma @default from the model does not remove
-- an existing PostgreSQL default when the initial baseline is merely resolved.
-- Drop the old default without changing any existing manager credentials.
ALTER TABLE "User" ALTER COLUMN "pin" DROP DEFAULT;
