'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const LabelPrintItem = require('../models/LabelPrintItem');
const { getCoreMongoUri, getCoreDbName } = require('../config/databaseLayout');

const BAD_DEPARTMENTS = [
  '亚叁汁',
  'BBQ和菠萝酱',
  '咖喱亚叁汁',
  '搅碎南姜',
  '牛油',
  '羊奶酪',
  '辣椒酱',
  '蒜蓉',
  '蔓越莓酱',
  'BBQ 酱',
  '意大利草药酱',
  '香茅',
  '酸酐汁',
  '鸡肉与BBQ酱 *',
  '黑胡椒鸡 *',
  '黑胡椒鸡翅 *',
  '印第安鸡 (全) *',
  '印第安鸡翅 *',
  '印第安鸡 *',
  '鸡扒 *',
  '黄姜娘惹鸡 *',
  '鸡肉卷 *',
  '炸小鸡翅 *',
  '药材鸡 *',
  '蜜汁鸡翅膀 *',
  '蜜汁鸡 *',
  '娘惹鸡腿 *',
  '泰式香兰叶鸡 *',
  '烤鸡 *',
  '迷迭香草药鸡 (全) *',
  '烤鸡与迷迭香草药 *',
  '日式鸡 *',
  '火鸡 (全) *',
  '耗油',
  '欧芹（新鲜）',
  '罗家花',
  '叁芭辣椒 (开)',
  '日式酱',
  '东炎酱',
  '鲜奶油',
  '白酱',
  '黑胡椒粉',
  '搅柠檬叶',
  '搅香茅',
  '印第安粉',
  '鸡精粉',
  '辣椒粉',
  '黑酱油',
  '草药混合',
  '蜂蜜',
  '生抽',
  '酸酐水（瓶）',
  '味精',
  '橄榄油',
  '牛至',
  '欧芹',
  '普兰塔',
  '迷迭香',
  '盐',
  '麻油',
  '亚叁皮',
  '百里香',
  '黄姜粉',
  '白胡椒粉',
  '白酱粉',
  '黄芥末'
];

async function main() {
  const execute = process.argv.includes('--execute');
  const allowLocal = process.argv.includes('--allow-local');
  const mongoUri = getCoreMongoUri();
  const dbName = getCoreDbName();
  if (!mongoUri) {
    throw new Error('Missing MASTERAPP_CORE_MONGODB_URI. Set it to the MongoDB Atlas core URI before running this cleanup.');
  }
  if (!allowLocal && !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('Refusing to run against a non-Atlas URI. Set MASTERAPP_CORE_MONGODB_URI to Atlas, or pass --allow-local if you really intend local cleanup.');
  }

  console.log(`Target: ${mongoUri.replace(/\/\/([^:]+):[^@]+@/, '//$1:***@')} / ${dbName}`);
  await mongoose.connect(mongoUri, { dbName });

  const query = {
    active: true,
    departmentName: { $in: BAD_DEPARTMENTS }
  };
  const matches = await LabelPrintItem.find(query, 'name nameEnglish nameChinese departmentName category').sort({ departmentName: 1, name: 1 }).lean();

  console.log(`Matched ${matches.length} active label item(s) in ${new Set(matches.map((item) => item.departmentName)).size} bad department(s).`);
  matches.slice(0, 40).forEach((item) => {
    console.log(`- ${item.departmentName} :: ${item.nameEnglish || item.name || item.nameChinese || item._id}`);
  });
  if (matches.length > 40) console.log(`...and ${matches.length - 40} more`);

  if (!execute) {
    console.log('\nDry run only. Re-run with --execute to deactivate these imported duplicate items.');
    await mongoose.disconnect();
    return;
  }

  const result = await LabelPrintItem.updateMany(query, { $set: { active: false } });
  console.log(`Deactivated ${result.modifiedCount || 0} item(s).`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
