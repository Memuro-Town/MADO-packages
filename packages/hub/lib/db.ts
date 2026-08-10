import { PrismaClient } from '@prisma/client';

// SQLite の ROWID など BigInt 型フィールドを JSON シリアライズ可能にする
(BigInt.prototype as unknown as Record<string, unknown>).toJSON = function () {
  return this.toString();
};

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
