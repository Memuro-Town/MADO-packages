const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

(async () => {
  try {
    const count = await prisma.resident_table.count();
    console.log('📊 総行数:', count);

    const all = await prisma.resident_table.findMany({ take: 5 });
    console.log('\n📝 最初の5行:');
    all.forEach(row => {
      console.log(`  - 宛名番号: ${row.atena_code}, 氏名: ${row.name}`);
    });
  } catch (e) {
    console.error('❌ エラー:', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
