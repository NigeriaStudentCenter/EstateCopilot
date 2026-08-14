import { PrismaClient } from '@prisma/client';

// A single shared client. In MOCK_MODE routes never call this, so the
// server boots fine even with no DATABASE_URL / no running Postgres.
export const prisma = new PrismaClient();
