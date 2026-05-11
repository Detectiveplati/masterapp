// One-shot script: update all templates with heightMm 62 → 29
const server = require('../server.js');
setTimeout(async () => {
  const LabelPrintTemplate = require('../models/LabelPrintTemplate');
  const result = await LabelPrintTemplate.updateMany({ heightMm: 62 }, { $set: { heightMm: 29 } });
  console.log('Updated', result.modifiedCount, 'template(s) to heightMm: 29');
  process.exit(0);
}, 4000);
