'use strict';

const sharedInstructions = [
  'Employee to tick each checklist after cleaning and disinfecting according to required frequency.',
  'Employee to check the condition of breakable items and tick if condition is acceptable.',
  'Employee to update the respective supervisor or manager for any equipment failure or required maintenance and record it in the remarks column.',
  'Additional cleaning and disinfection may be done when necessary without recording a tick on the form.'
];

const UNIT_SET_ALL_KITCHENS = [
  { code: '#06-15/16/17/27', label: 'Unit #06-15/16/17/27', labelZh: '厨房 #06-15/16/17/27' },
  { code: '#06-24', label: 'Unit #06-24', labelZh: '厨房 #06-24', labelTa: 'அலகு #06-24' },
  { code: '#06-19', label: 'Unit #06-19', labelZh: '厨房 #06-19' },
  { code: '#06-08', label: 'Unit #06-08', labelZh: '厨房 #06-08' },
  { code: '#05-26', label: 'Unit #05-26', labelZh: '厨房 #05-26' },
  { code: '#05-27', label: 'Unit #05-27', labelZh: '厨房 #05-27' }
];

const VEHICLE_UNIT_OPTIONS = [
  'GBA2807Y', 'GBD4397J', 'GBD9017Z', 'GBE1650S', 'GBE1676T', 'GBG9171U', 'GBG9234Y',
  'GBH8368X', 'GBH8417M', 'GBJ4644P', 'GBJ4923J', 'GBK709H', 'GBM3470P',
  'YP5038D', 'YP7957M', 'YR1175G', 'YR2874R', 'YR2985D', 'YR3792L', 'YR3849H', 'YR3893D'
].map((plate) => ({ code: plate, label: `Vehicle ${plate}`, labelZh: `车辆 ${plate}` }));

function i(id, label, labelZh, labelTa) {
  return { id, label, labelZh: labelZh || '', labelTa: labelTa || '' };
}
function s(id, title, titleZh, arg3, arg4, arg5) {
  const titleTa = Array.isArray(arg5) ? arg3 : '';
  const frequency = Array.isArray(arg5) ? arg4 : arg3;
  const items = Array.isArray(arg5) ? arg5 : arg4;
  return { id, title, titleZh: titleZh || '', titleTa, frequency, items };
}
function f(id, label, labelZh, arg3, arg4, arg5) {
  const hasTamil = typeof arg4 === 'string';
  const labelTa = hasTamil ? arg3 : '';
  const type = hasTamil ? arg4 : arg3;
  const options = hasTamil ? arg5 : arg4;
  return { id, label, labelZh: labelZh || '', labelTa, type, ...(options || {}) };
}
function sanitizeLogFieldValue(field, value) {
  const raw = value == null ? '' : value;
  switch (field.type) {
    case 'date':
      return /^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim()) ? String(raw).trim() : '';
    case 'time':
      return /^\d{2}:\d{2}$/.test(String(raw).trim()) ? String(raw).trim() : '';
    case 'number': {
      const num = Number(raw);
      if (!Number.isFinite(num)) return '';
      if (field.min != null && num < field.min) return '';
      if (field.max != null && num > field.max) return '';
      return num;
    }
    case 'yes_no':
      return ['Y', 'N'].includes(String(raw).toUpperCase()) ? String(raw).toUpperCase() : '';
    case 'pass_fail':
      return ['P', 'F'].includes(String(raw).toUpperCase()) ? String(raw).toUpperCase() : '';
    case 'textarea':
      return typeof raw === 'string' ? raw.trim().slice(0, field.maxLength || 4000) : '';
    case 'text':
    default:
      return typeof raw === 'string' ? raw.trim().slice(0, field.maxLength || 255) : '';
  }
}

const RAW_TEMPLATES = [
  {
    code: 'CAC-PRP-07-F01-A', revision: '01', title: 'Equipment Cleanliness and Maintenance Checklist', titleZh: '器具清洁和维护清单', titleTa: 'உபகரண சுத்தம் மற்றும் பராமரிப்பு சரிபார்ப்பு பட்டியல்', categoryTa: 'சுத்தம் மற்றும் பராமரிப்பு',
    unitOptions: [{ code: '#06-24', label: 'Unit #06-24', labelZh: '厨房 #06-24', labelTa: 'அலகு #06-24' }],
    instructions: sharedInstructions,
    instructionsZh: [
      '员工应按照规定频率在完成清洁和消毒后勾选每项检查。',
      '员工应检查易碎物品的状况，如状态可接受则勾选。',
      '如有任何设备故障或需要维修，应通知相关主管或经理，并记录在备注栏中。',
      '如有需要，可进行额外清洁和消毒，无需在表格上另行勾选。'
    ],
    instructionsTa: [
      'தேவையான அடிக்கடி அடிப்படையில் சுத்தம் மற்றும் கிருமிநாசினி செய்த பின் ஒவ்வொரு சரிபார்ப்புப் பட்டியலையும் பணியாளர் குறிக்க வேண்டும்.',
      'உடைந்துபோகக்கூடிய பொருட்களின் நிலையை பணியாளர் சரிபார்த்து, நிலை ஏற்றதாக இருந்தால் குறிக்க வேண்டும்.',
      'ஏதேனும் உபகரணக் கோளாறு அல்லது பராமரிப்பு தேவையிருந்தால் தொடர்புடைய மேற்பார்வையாளர் அல்லது மேலாளருக்கு தெரியப்படுத்தி, அதை குறிப்புகள் பகுதியில் பதிவு செய்ய வேண்டும்.',
      'தேவையானபோது கூடுதல் சுத்தம் மற்றும் கிருமிநாசினி செய்யலாம்; அதற்கு தனியாக குறிக்க வேண்டிய அவசியமில்லை.'
    ],
    taUnitCodes: ['#06-24'],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' }, weekly: { en: 'Weekly', zh: '每周' } },
    sections: [
      s('seafood', 'Seafood Processing Room', '海鲜加工房', 'கடலுணவு செயலாக்க அறை', 'daily', [i('door','Door knobs, buttons or latches','门把手、按钮或门闩','கதவு கைப்பிடி, பொத்தான் அல்லது பூட்டு'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽','கைக் கழுவும் தொட்டி அல்லது சமையலறை சிங்க்'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件','சமையலறை உபகரணங்கள் (அலமாரி, தட்டு, மேசை, ட்ராலி போன்றவை)'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件','சிறிய சமையல் பொருட்கள் (நறுக்குப் பலகை, GN பான், கத்தி, சமையல் கருவிகள் போன்றவை)'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具','உடையக்கூடிய பாத்திரங்கள் மற்றும் மரக் கைப்பிடி கருவிகள்'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器','விநியோகிப்பான் (கைக்கழுவும் சோப்பு, சானிடைசர், பேப்பர் டவல் போன்றவை)'), i('bins','Refuse bins','垃圾桶','கழிவு தொட்டிகள்'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏','சுவர்கள், தரை மற்றும் தரை வடிகால்')]),
      s('meat', 'Meat Processing Room', '肉类加工房', 'இறைச்சி செயலாக்க அறை', 'daily', [i('door','Door knobs, buttons or latches','门把手、按钮或门闩','கதவு கைப்பிடி, பொத்தான் அல்லது பூட்டு'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽','கைக் கழுவும் தொட்டி அல்லது சமையலறை சிங்க்'), i('app','Kitchen appliances (mixer, tumbler, etc.)','厨房设备','சமையலறை இயந்திரங்கள் (மிக்சர், டம்ப்ளர் போன்றவை)'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件','சமையலறை உபகரணங்கள் (அலமாரி, தட்டு, மேசை, ட்ராலி போன்றவை)'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件','சிறிய சமையல் பொருட்கள் (நறுக்குப் பலகை, GN பான், கத்தி, சமையல் கருவிகள் போன்றவை)'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具','உடையக்கூடிய பாத்திரங்கள் மற்றும் மரக் கைப்பிடி கருவிகள்'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器','விநியோகிப்பான் (கைக்கழுவும் சோப்பு, சானிடைசர், பேப்பர் டவல் போன்றவை)'), i('bins','Refuse bins','垃圾桶','கழிவு தொட்டிகள்'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏','சுவர்கள், தரை மற்றும் தரை வடிகால்')]),
      s('store', 'Dry Store / Packaging Material Store / Walk-in Chiller & Freezer', '仓库 / 包装材料室 / 冷藏冷冻室', 'உலர் சேமிப்பு / பேக்கேஜிங் பொருள் சேமிப்பு / நடந்து செல்லும் குளிர்சாதன & உறைவு அறை', 'daily', [i('door','Door knobs, buttons or latches','门把手、按钮或门闩','கதவு கைப்பிடி, பொத்தான் அல்லது பூட்டு'), i('equip','Storage area equipment (shelves, trolley, etc.)','存储区设备','சேமிப்பு பகுதி உபகரணங்கள் (தட்டு, ட்ராலி போன்றவை)'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏','சுவர்கள், தரை மற்றும் தரை வடிகால்')]),
      s('footbath', 'Foot Bath', '脚踏消毒池', 'கால் கிருமிநாசினி தொட்டி', 'daily', [i('floor','Walls, floor and floor traps','墙壁、地面和地漏','சுவர்கள், தரை மற்றும் தரை வடிகால்'), i('time','Time record, water change within 4h','时间记录，4小时内换水','நேர பதிவு, 4 மணி நேரத்திற்குள் நீர் மாற்றம்')]),
      s('sump', 'Sump Room', '污水房', 'கழிவுநீர் அறை', 'daily', [i('waste','Waste sieve','废筛','கழிவு வடிகட்டி'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏','சுவர்கள், தரை மற்றும் தரை வடிகால்')]),
      s('changing', 'Changing Room', '更衣室', 'மாற்றும் அறை', 'daily', [i('equip','Changing room equipment (locker, mirror, etc.)','更衣室设备','மாற்றும் அறை உபகரணங்கள் (லாக்கர், கண்ணாடி போன்றவை)')]),
      s('toilet', 'Toilet', '洗手间', 'கழிப்பறை', 'daily', [i('clean','Toilets are clean, dry, well-ventilated and in good repair','洗手间干净、干燥、通风良好且维护良好','கழிப்பறை சுத்தமாக, உலர்ந்ததாக, நல்ல காற்றோட்டத்துடன் மற்றும் நல்ல நிலையில் உள்ளது'), i('fit','Toilet fittings facilities are in good working condition and repair','洗手间设施运行良好','கழிப்பறை உபகரணங்கள் நல்ல செயல்நிலையிலும் சரிசெய்யப்பட்ட நிலையில் உள்ளன'), i('amen','Basic amenities such as soap, toilet paper, paper towel and waste bins are available','基本用品已提供','சோப்பு, கழிப்பறை தாள், பேப்பர் டவல் மற்றும் கழிவு தொட்டிகள் போன்ற அடிப்படை வசதிகள் உள்ளன')]),
      s('weekly', 'All Areas', '全部区域', 'அனைத்து பகுதிகள்', 'weekly', [i('switch','Switches or power points','开关或电源插座','சுவிட்ச் அல்லது மின்சார பாயிண்ட்'), i('door','Door surfaces, frames, closers or curtains','门表面、门框、闭门器或门帘','கதவு மேற்பரப்பு, பிரேம், கிளோசர் அல்லது திரை'), i('fan','Evaporator fan, ventilation fan, fresh air or exhaust hood','风扇/排风/抽油烟罩','ஆவியாக்கி விசிறி, காற்றோட்ட விசிறி, புதிய காற்று அல்லது எக்ஸாஸ்ட் ஹூட்'), i('fire','Fire extinguishers and electrical switch boxes','灭火器和电器开关箱','தீ அணைப்பான் மற்றும் மின்சார சுவிட்ச் பெட்டி'), i('columns','Columns, ceilings and overhead fixtures','柱子、天花板及高处装置','தூண், மேல்சுவர் மற்றும் மேல் பொருத்தப்பட்ட உபகரணங்கள்')])
    ]
  },
  {
    code: 'CAC-PRP-07-F01-B', revision: '01', title: 'Equipment Cleanliness and Maintenance Checklist', titleZh: '器具清洁和维护清单',
    unitOptions: [{ code: '#06-15/16/17/27', label: 'Unit #06-15/16/17/27', labelZh: '厨房 #06-15/16/17/27' }], instructions: sharedInstructions, instructionsZh: [
      '员工应按照规定频率在完成清洁和消毒后勾选每项检查。',
      '员工应检查易碎物品的状况，如状态可接受则勾选。',
      '如有任何设备故障或需要维修，应通知相关主管或经理，并记录在备注栏中。',
      '如有需要，可进行额外清洁和消毒，无需在表格上另行勾选。'
    ],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' }, weekly: { en: 'Weekly', zh: '每周' } },
    sections: [
      s('office', 'Office / Changing Room / Chemical & Cleaning Tools Store', '办公室 / 更衣室 / 化学品室 / 清洁工具室', 'daily', [i('door','Door knobs, buttons or latches','门把手，按钮或门闩'), i('floor','Wall, floor and floor traps','墙壁，地面和地漏'), i('change','Changing room equipment (locker, mirror, etc.)','更衣室设备（储物柜，镜子等）'), i('storedoor','Door knobs, buttons or latches','门把手，按钮或门闩'), i('storeequip','Storage area equipment (shelves, trolley, etc.)','存储区设备（架子，推车，等）'), i('storefloor','Wall, floor and floor traps','墙壁，地面和地漏')]),
      s('ingredient-prep', 'Ingredient Preparation Room', '配料房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (food processors, weighing scale, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('hot', 'Hot Kitchen', '热厨房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (bratt pan, combi oven, cooking mixer, fryer, gas burner, stove top, warmer, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, storage container, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares and cookwares (board, GN pan, knife, utensils, pan, pot, wok, etc.)','厨房小件及炊具'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('cold', 'Cold Kitchen', '冷厨房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (immersion blender, sealing machine, standing chiller, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('cool', 'Cooling & Packing Room', '冷却与包装房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (blast freezer, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (GN pan, storage container, cooking utensil, packing utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('dish', 'Dishing & Packing Room', '摆盘与包装房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins','洗手盆'), i('app','Kitchen appliances (blast freezer, microwave, warmer, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (GN pan, storage container, dishing utensil, packing utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('holding', 'Holding & Collection Area / Dry Store, Packaging Material Store, Walk In Chiller / Freezer', '存放与领取区 / 仓库 / 包装材料室 / 步入式冷藏室/冷冻室', 'daily', [i('holddoor','Door knobs, buttons or latches','门把手，按钮或门闩'), i('holdsink','Hand wash basins','洗手台'), i('holdequip','Kitchen equipment (shelves, trolley, etc.)','厨房硬件（架子，推车等）'), i('holddisp','Dispensers (hand soap, sanitizer, paper towel, etc.) *refilled when required','容器（洗手液，消毒液，擦手纸等）*用完后重新装满'), i('holdbins','Refuse bins','垃圾桶'), i('holdfloor','Wall, floor and floor traps','墙壁，地面和地漏'), i('drydoor','Door knobs, buttons or latches','门把手，按钮或门闩'), i('dryequip','Storage area equipment (shelves, trolley, etc.)','存储区设备（架子，推车，等）'), i('dryfloor','Wall, floor and floor traps','墙壁，地面和地漏')]),
      s('corridor', 'Corridor', '走廊', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basin','洗手盆'), i('equip','Kitchen equipment (shelves, trolley, etc.)','设备'), i('small','Kitchen smallwares (GN pan, storage container, dishing utensil, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('washing', 'Washing Area / Sump Area / Toilet', '清洗区 / 污水区 / 洗手间', 'daily', [i('sink','Dishwashing sinks','洗碗槽'), i('sieve','Waste sieve','废筛'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏'), i('clean','Toilets are clean, dry, well-ventilated and in good repair','洗手间干净、干燥、通风良好'), i('fit','Toilet fittings and facilities are in good working condition','洗手间设施运作正常'), i('amen','Soap, toilet paper, paper towel and waste bins are available','肥皂、卫生纸、纸巾和垃圾桶齐全')]),
      s('weekly', 'All Areas', '全部区域', 'weekly', [i('ice','Ice machine','制冰机'), i('switch','Switches or power points','开关或电源插座'), i('door','Door surfaces, frames, closers or curtains','门表面、门框、闭门器或门帘'), i('fan','Evaporator fan, ventilation fan, fresh air or exhaust hood','风扇/排风/抽油烟罩'), i('fire','Fire extinguishers and electrical switch boxes','灭火器和电器开关箱'), i('columns','Columns, ceilings and overhead fixtures','柱子、天花板及高处装置')])
    ]
  },
  {
    code: 'CAC-PRP-07-F01-C', revision: '01', title: 'Equipment Cleanliness and Maintenance Checklist', titleZh: '器具清洁和维护清单',
    unitOptions: [{ code: '#06-19', label: 'Unit #06-19', labelZh: '厨房 #06-19' }], instructions: sharedInstructions, instructionsZh: [
      '员工应按照规定频率在完成清洁和消毒后勾选每项检查。',
      '员工应检查易碎物品的状况，如状态可接受则勾选。',
      '如有任何设备故障或需要维修，应通知相关主管或经理，并记录在备注栏中。',
      '如有需要，可进行额外清洁和消毒，无需在表格上另行勾选。'
    ],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' }, weekly: { en: 'Weekly', zh: '每周' } },
    sections: [
      s('processing', 'Processing Area', '加工区', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (cake mixer, deck oven, standing chiller, steamer, stove top, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, storage container, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('sandwich', 'Sandwich Room', '三明治房', 'daily', [i('curtain','Curtain strip','门帘'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('cake', 'Cake Room', '蛋糕房', 'daily', [i('curtain','Curtain strip','门帘'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('beverage', 'Beverage Area', '饮品区', 'daily', [i('sink','Kitchen sinks','厨房水槽'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (cambro, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('walkin', 'Walk In Chiller / Freezer', '步入式冷藏室/冷冻室', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('equip','Storage area equipment (shelves, trolley, etc.)','存储区设备'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('washing', 'Washing Area', '清洗区', 'daily', [i('sink','Dishwashing sinks','洗碗槽'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('toilet', 'Toilet', '洗手间', 'daily', [i('clean','Toilets are clean, dry, well-ventilated and in good repair','洗手间干净、干燥、通风良好'), i('fit','Toilet fittings facilities are in good working condition and repair','洗手间设施运行良好'), i('amen','Basic amenities such as soap, toilet paper, paper towel and waste bins are available','基本用品已提供')]),
      s('weekly', 'All Areas', '全部区域', 'weekly', [i('ice','Ice machine','制冰机'), i('switch','Switches or power points','开关或电源插座'), i('door','Door surfaces, frames, closers or curtains','门表面、门框、闭门器或门帘'), i('fan','Fan, evaporator fan, ventilation fan, fresh air or exhaust hood','风扇/排风/抽油烟罩'), i('fire','Fire extinguishers and electrical switch boxes','灭火器和电表箱'), i('columns','Columns, ceilings and overhead fixtures','柱子、天花板及高处装置')])
    ]
  },
  {
    code: 'CAC-PRP-07-F01-D', revision: '01', title: 'Equipment Cleanliness and Maintenance Checklist', titleZh: '器具清洁和维护清单',
    unitOptions: [{ code: '#06-08', label: 'Unit #06-08', labelZh: '厨房 #06-08' }], instructions: sharedInstructions, instructionsZh: [
      '员工应按照规定频率在完成清洁和消毒后勾选每项检查。',
      '员工应检查易碎物品的状况，如状态可接受则勾选。',
      '如有任何设备故障或需要维修，应通知相关主管或经理，并记录在备注栏中。',
      '如有需要，可进行额外清洁和消毒，无需在表格上另行勾选。'
    ],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' }, weekly: { en: 'Weekly', zh: '每周' } },
    sections: [
      s('prewash', 'Pre-Wash Zone', '预洗区', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Sinks','水槽'), i('app','Appliances (dishwasher, dryer, washing machine, etc.)','设备'), i('wares','Catering wares (GN pan, mould, thermo box, cooking utensils, etc.)','餐饮器具'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('cleanware', 'Clean Ware Holding Zone', '洁净器具存放区', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('wares','Catering wares (GN pan, mould, thermo box, cooking utensils, table cloth, etc.)','餐饮器具'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏'), i('equip','Equipment (cabinet, shelves, table, trolley, etc.)','硬件')]),
      s('sump', 'Sump Area', '污水区', 'daily', [i('waste','Waste sieve','废筛'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('toilet', 'Toilet', '洗手间', 'daily', [i('clean','Toilets are clean, dry, well-ventilated and in good repair','洗手间干净、干燥、通风良好'), i('fit','Toilet fittings facilities are in good working condition and repair','洗手间设施运行良好'), i('amen','Basic amenities such as soap, toilet paper, paper towel and waste bins are available','基本用品已提供')]),
      s('weekly', 'All Areas', '全部区域', 'weekly', [i('switch','Switches or power points','开关或电源插座'), i('door','Door surfaces, frames, closers or curtains','门表面、门框、闭门器或门帘'), i('fan','Ventilation fan or fan','抽风机或风扇'), i('fire','Fire extinguishers and electrical switch boxes','灭火器和电器开关箱'), i('columns','Columns, ceilings and overhead fixtures','柱子、天花板及高处装置')])
    ]
  },
  {
    code: 'CAC-PRP-07-F01-E', revision: '01', title: 'Equipment Cleanliness and Maintenance Checklist', titleZh: '器具清洁和维护清单',
    unitOptions: [{ code: '#05-26', label: 'Unit #05-26', labelZh: '厨房 #05-26' }], instructions: sharedInstructions, instructionsZh: [
      '员工应按照规定频率在完成清洁和消毒后勾选每项检查。',
      '员工应检查易碎物品的状况，如状态可接受则勾选。',
      '如有任何设备故障或需要维修，应通知相关主管或经理，并记录在备注栏中。',
      '如有需要，可进行额外清洁和消毒，无需在表格上另行勾选。'
    ],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' }, weekly: { en: 'Weekly', zh: '每周' } },
    sections: [
      s('hot', 'Hot Kitchen', '厨房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (air-blast wok, bratt pan, combi oven, deck oven, induction cooker, low stove, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('veg', 'Vegetable Processing Room', '菜房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('packing', 'Packing Room', '包装房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basin','洗手盆'), i('app','Kitchen appliances (warmer, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (packing utensils, etc.)','厨房小件'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('store', 'Dry Store, Walk In Chiller / Freezer', '仓库，步入式冷藏室/冷冻室', 'daily', [i('door','Door knobs, buttons or latches','门把手，按钮或门闩'), i('equip','Storage area equipment (shelves, trolley, etc.)','存储区设备（架子，推车，等）'), i('floor','Wall, floor and floor traps','墙壁，地面和地漏')]),
      s('washing', 'Washing Area', '清洗区', 'daily', [i('sink','Dishwashing sinks','洗碗槽'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('changing', 'Changing Room', '更衣室', 'daily', [i('equip','Changing room equipment (locker, mirror, etc.)','更衣室设备')]),
      s('toilet', 'Toilet', '洗手间', 'daily', [i('clean','Toilets are clean, dry, well-ventilated and in good repair','洗手间干净、干燥、通风良好'), i('fit','Toilet fittings facilities are in good working condition and repair','洗手间设施运行良好'), i('amen','Basic amenities such as soap, toilet paper, paper towel and waste bins are available','基本用品已提供')]),
      s('weekly', 'All Areas', '全部区域', 'weekly', [i('switch','Switches or power points','开关或电源插座'), i('door','Door surfaces, frames, closers or curtains','门表面、门框、闭门器或门帘'), i('fan','Evaporator fan, ventilation fan, fresh air or exhaust hood','风扇/排风/抽油烟罩'), i('fire','Fire extinguishers and electrical switch boxes','灭火器和电器开关箱'), i('columns','Columns, ceilings and overhead fixtures','柱子、天花板及高处装置')])
    ]
  },
  {
    code: 'CAC-PRP-07-F01-F', revision: '00', title: 'Equipment Cleanliness and Maintenance Checklist', titleZh: '器具清洁和维护清单',
    unitOptions: [{ code: '#05-27', label: 'Unit #05-27', labelZh: '厨房 #05-27' }], instructions: sharedInstructions, instructionsZh: [
      '员工应按照规定频率在完成清洁和消毒后勾选每项检查。',
      '员工应检查易碎物品的状况，如状态可接受则勾选。',
      '如有任何设备故障或需要维修，应通知相关主管或经理，并记录在备注栏中。',
      '如有需要，可进行额外清洁和消毒，无需在表格上另行勾选。'
    ],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' }, weekly: { en: 'Weekly', zh: '每周' } },
    sections: [
      s('hot', 'Hot Kitchen', '厨房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (combi oven, cooking mixer, low stock pot, standing chiller, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('ingredient', 'Ingredient Preparation Room', '菜房', 'daily', [i('door','Door knobs, buttons or latches','门把手'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (blender / mixer, onion peeler, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('packing', 'Packing Room', '包装房', 'daily', [i('curtain','Curtain strip','门帘'), i('sink','Hand wash basin','洗手盆'), i('app','Kitchen appliances (blast freezer, thermoforming machine, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (packing utensils, etc.)','厨房小件'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('store', 'Dry Store, Walk In Chiller / Freezer', '仓库，步入式冷藏室/冷冻室', 'daily', [i('door','Door knobs, buttons or latches','门把手，按钮或门闩'), i('equip','Storage area equipment (shelves, trolley, etc.)','存储区设备（架子，推车，等）'), i('floor','Wall, floor and floor traps','墙壁，地面和地漏')]),
      s('washing', 'Washing Area', '清洗区', 'daily', [i('sink','Dishwashing sinks','洗碗槽'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('changing', 'Changing Room', '更衣室', 'daily', [i('equip','Changing room equipment (locker, mirror, etc.)','更衣室设备')]),
      s('toilet', 'Toilet', '洗手间', 'daily', [i('clean','Toilets are clean, dry, well-ventilated and in good repair','洗手间干净、干燥、通风良好'), i('fit','Toilet fittings facilities are in good working condition and repair','洗手间设施运行良好'), i('amen','Basic amenities such as soap, toilet paper, paper towel and waste bins are available','基本用品已提供')]),
      s('weekly', 'All Areas', '全部区域', 'weekly', [i('switch','Switches or power points','开关或电源插座'), i('door','Door surfaces, frames, closers or curtains','门表面、门框、闭门器或门帘'), i('fan','Evaporator fan, ventilation fan, fresh air or exhaust hood','风扇/排风/抽油烟罩'), i('fire','Fire extinguishers and electrical switch boxes','灭火器和电器开关箱'), i('columns','Columns, ceilings and overhead fixtures','柱子、天花板及高处装置')])
    ]
  },
  {
    code: 'CAC-PRP-08-F01', revision: '00', title: 'Daily Personal Hygiene Checklist', titleZh: '每日个人卫生检查表', titleTa: 'தினசரி தனிநபர் சுகாதார சரிபார்ப்பு பட்டியல்',
    formType: 'matrix_monthly',
    periodType: 'monthly',
    category: 'Personal Hygiene',
    categoryZh: '个人卫生',
    categoryTa: 'தனிநபர் சுகாதாரம்',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'landscape', reportType: 'monthly-grid' },
    unitOptions: UNIT_SET_ALL_KITCHENS,
    instructions: [
      'Use this form for all production staff when they report for work and before entering the production facilities.',
      'The responsible personnel shall check staff against each hygiene requirement and record the result for the respective day.',
      'Immediate corrective action must be taken when any personal hygiene requirement is unacceptable.',
      'Verification should be carried out by the respective supervisor.'
    ],
    instructionsZh: [
      '所有生产部员工需在报到或进入生产设施之前使用此表格。',
      '相关人员需按照检查清单检查员工，并在对应日期记录结果。',
      '若个人卫生不合格，须立即采取纠正措施。',
      '验证过程必须由主管执行。'
    ],
    instructionsTa: [
      'அனைத்து உற்பத்தி பணியாளர்களும் பணிக்கு வரும்போது மற்றும் உற்பத்தி பகுதிக்குள் நுழைவதற்கு முன் இந்தப் படிவத்தை பயன்படுத்த வேண்டும்.',
      'பொறுப்புப் பணியாளர் ஒவ்வொரு சுகாதார தேவையையும் சரிபார்த்து அதற்கான நாளில் முடிவை பதிவு செய்ய வேண்டும்.',
      'தனிநபர் சுகாதாரத் தேவைகள் ஏற்றதாக இல்லாவிட்டால் உடனடி திருத்த நடவடிக்கை எடுக்க வேண்டும்.',
      'சரிபார்ப்பு சம்பந்தப்பட்ட மேற்பார்வையாளரால் மேற்கொள்ளப்பட வேண்டும்.'
    ],
    taUnitCodes: ['#06-24'],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' } },
    sections: [
      s('personal-hygiene', 'Daily Personal Hygiene', '每日个人卫生', 'தினசரி தனிநபர் சுகாதாரம்', 'daily', [
        i('hands', 'Hands are properly washed and wearing gloves.', '双手清洗干净并带手套', 'கைகள் முறையாக கழுவப்பட்டு கையுறைகள் அணிந்திருக்க வேண்டும்'),
        i('nails', 'Finger nails are short, free of nail varnish and clean.', '指甲短，无指甲油，干净', 'கைநகங்கள் குறுகியதாகவும், நகப்பூச்சு இன்றியும், சுத்தமாகவும் இருக்க வேண்டும்'),
        i('attire', 'Production attire is complete, clean and properly worn, without loose jewelry.', '生产装束完整，清洁，穿戴正确，无松散的首饰', 'உற்பத்தி உடை முழுமையாக, சுத்தமாக, சரியாக அணிந்திருக்க வேண்டும்; தளர்வான ஆபரணம் இருக்கக் கூடாது'),
        i('health', 'Health status is in good condition with no signs or symptoms of illness and no open wound observed.', '健康状态良好，无疾病症状，无明显伤口', 'உடல்நிலை நன்றாக இருந்து, நோய் அறிகுறிகளும் திறந்த காயங்களும் இருக்கக் கூடாது')
      ])
    ]
  },
  {
    code: 'CAC-PRP-07-F02', revision: '00', title: 'Daily Vehicle Cleanliness Checklist', titleZh: '每日车辆清洁检查表',
    formType: 'matrix_monthly',
    periodType: 'monthly',
    category: 'Vehicle Hygiene',
    categoryZh: '车辆卫生',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'landscape', reportType: 'monthly-grid' },
    unitOptions: VEHICLE_UNIT_OPTIONS,
    instructions: [
      'The designated personnel shall check the cleanliness of the transport vehicle.',
      'Record the result in the respective column with a tick when acceptable.',
      'Use remarks or corrective action when a vehicle check is unacceptable.'
    ],
    instructionsZh: [
      '指定人员应检查运输车辆的清洁情况。',
      '如符合要求，请在对应栏位勾选。',
      '如不符合要求，请在备注或纠正措施栏中记录。'
    ],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' } },
    sections: [
      s('vehicle', 'Transport Vehicle', '运输车辆', 'daily', [
        i('exterior', 'Exterior & interior cleaned', '车内/外清洁'),
        i('dashboard', 'Dashboard cleaned and tidy', '仪表盘干净整洁'),
        i('pest', 'Free from pest', '无害虫'),
        i('odour', 'No foul odour', '无异味')
      ])
    ]
  },
  {
    code: 'CAC-PRP-06-F01', revision: '00', title: 'Reuse Metal Oil Tin Record', titleZh: '重复使用金属油桶记录',
    formType: 'log_entries',
    periodType: 'monthly',
    category: 'Operational Record',
    categoryZh: '操作记录',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'portrait', reportType: 'log-entries' },
    unitOptions: [{ code: '#05-27', label: 'Department #05-27', labelZh: '部门 #05-27' }],
    instructions: [
      'Record each reuse of a metal oil tin as a separate entry.',
      'Check the physical condition and cleanliness before reuse.',
      'Mark the status as Pass or Fail and record the checker name.'
    ],
    instructionsZh: [
      '每次重复使用金属油桶时，需单独记录一行。',
      '重复使用前检查油桶外观及清洁情况。',
      '标明合格或不合格，并记录检查人员姓名。'
    ],
    fields: [
      f('date', 'Date', '日期', 'date'),
      f('quantity', 'Number of metal oil tins reused', '重复使用金属油桶数量', 'number', { min: 0, max: 9999 }),
      f('covered', 'Metal oil tin is covered without any opening', '金属油桶盖上，无开口', 'yes_no'),
      f('fragments', 'No metal fragments found inside the interior of the metal oil tin', '金属油桶内部未发现金属碎片', 'yes_no'),
      f('cleanDry', 'Metal oil tin is clean and dry', '金属油桶清洁、干燥', 'yes_no'),
      f('status', 'Status (P / F)', '状态（合格/不合格）', 'pass_fail'),
      f('checkedBy', 'Checked by', '检测人', 'text', { maxLength: 120 })
    ],
    footerFields: [
      f('remarks', 'Remarks', '备注', 'textarea', { maxLength: 4000 }),
      f('verifiedByText', 'Verified By', '验证', 'text', { maxLength: 120 })
    ]
  },
  {
    code: 'CAC-SOP-03-F01', revision: '00', title: 'Thawing Record', titleZh: '解冻记录', titleTa: 'உருகும் பதிவு',
    formType: 'log_entries',
    periodType: 'monthly',
    category: 'Thawing Record',
    categoryZh: '解冻记录',
    categoryTa: 'உருகும் பதிவு',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'portrait', reportType: 'log-entries' },
    unitOptions: [{ code: '#06-24', label: 'Unit #06-24', labelZh: '厨房 #06-24', labelTa: 'அலகு #06-24' }],
    instructions: [
      'Record each thawing activity as a separate row entry.',
      'Confirm the product is in a clean leak-proof package or plastic bag before thawing.',
      'Record start and end time for thawing under running water and note any remarks when necessary.'
    ],
    instructionsZh: [
      '每次解冻活动需单独记录一行。',
      '解冻前确认产品使用干净防漏包装或塑料袋。',
      '记录流水解冻的开始和结束时间，并在需要时填写备注。'
    ],
    instructionsTa: [
      'ஒவ்வொரு உருகும் செயல்பாடையும் தனித்தனி வரியாக பதிவு செய்யவும்.',
      'உருகுவதற்கு முன் பொருள் சுத்தமான கசிவில்லா பாக்கெட்டில் அல்லது பிளாஸ்டிக் பையில் இருப்பதை உறுதிப்படுத்தவும்.',
      'ஓடும் நீரில் உருகுவதற்கான தொடக்க மற்றும் முடிவு நேரத்தை பதிவு செய்து, தேவையானால் குறிப்புகளையும் சேர்க்கவும்.'
    ],
    taUnitCodes: ['#06-24'],
    fields: [
      f('date', 'Date', '日期', 'தேதி', 'date'),
      f('productName', 'Product Name', '产品名称', 'பொருளின் பெயர்', 'text', { maxLength: 180 }),
      f('cleanPackage', 'Clean leak-proof package or plastic bag (√ / X)', '干净的防漏包装或塑料袋（√ / X）', 'சுத்தமான கசிவில்லா பாக்கெட் அல்லது பிளாஸ்டிக் பை (√ / X)', 'yes_no'),
      f('runningWater', 'Running Water (√ / X)', '流水（√ / X）', 'ஓடும் நீர் (√ / X)', 'yes_no'),
      f('thawStart', 'Thawing Start', '开始', 'உருகல் தொடக்கம்', 'time'),
      f('thawEnd', 'Thawing End', '结束', 'உருகல் முடிவு', 'time'),
      f('checkedBy', 'Checked By', '谁记录', 'சரிபார்த்தவர்', 'text', { maxLength: 120 }),
      f('remarks', 'Remarks', '备注', 'குறிப்புகள்', 'text', { maxLength: 400 })
    ],
    footerFields: [
      f('verifiedByText', 'Verified By', '验证', 'சரிபார்த்தவர்', 'text', { maxLength: 120 })
    ]
  },
  {
    code: 'CAC-SOP-03-F03', revision: '05', title: 'Blast Freezing Record', titleZh: '速冻记录',
    formType: 'log_entries',
    periodType: 'monthly',
    category: 'Cooling & Freezing',
    categoryZh: '冷却与速冻',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'portrait', reportType: 'log-entries' },
    unitOptions: [{ code: '#05-27', label: 'Unit #05-27', labelZh: '厨房 #05-27' }],
    instructions: [
      'Record each blast freezing activity as a separate row entry.',
      'Record the product, tray or packet count, cooking completion information, blast freezing readings and recorder name.',
      'Use the verification lane after monthly review.'
    ],
    instructionsZh: [
      '每次速冻活动需单独记录一行。',
      '记录产品、托盘或包装数量、烹煮完成信息、速冻读数及记录人员姓名。',
      '月度审核后填写验证栏位。'
    ],
    fields: [
      f('date', 'Date', '日期', 'date'),
      f('productName', 'Product Name', '名称', 'text', { maxLength: 180 }),
      f('trayCount', 'No. of trays / pots / packets', '托盘 / 桶 / 包装数', 'number', { min: 0, max: 9999 }),
      f('finishedCoreTemp', 'Finished Core Temp.', '结束煮核心温度', 'text', { maxLength: 40 }),
      f('startCookingTime', 'Start cooking time', '开始煮时间', 'time'),
      f('endCookingTime', 'End cooking time', '结束煮时间', 'time'),
      f('blastFreezingTemp', 'Blast Freezing Temp (≤ -20°C)', '速冻温度（≤ -20°C）', 'text', { maxLength: 40 }),
      f('blastFreezingStartTime', 'Blast freezing start time', '速冻开始时间', 'time'),
      f('blastFreezingEndTime', 'Blast freezing end time', '速冻结束时间', 'time'),
      f('surfaceTempBefore', 'Product surface temp. Before (≥ 60°C)', '产品核心 / 表面温度 前（≥ 60°C）', 'text', { maxLength: 40 }),
      f('surfaceTempAfter', 'Product surface temp. After (≤ 3°C)', '产品核心 / 表面温度 后（≤ 3°C）', 'text', { maxLength: 40 }),
      f('recordedBy', 'Recorded by', '谁记录', 'text', { maxLength: 120 })
    ],
    footerFields: [
      f('verifiedByText', 'Verified By', '验证', 'text', { maxLength: 120 })
    ]
  },
  {
    code: 'CAC-SOP-03-F05', revision: '01', title: 'Fruits and Vegetables Washing and Sanitizing Record', titleZh: '水果和蔬菜清洗与消毒记录',
    formType: 'log_entries',
    periodType: 'monthly',
    category: 'Fruits & Vegetables',
    categoryZh: '水果与蔬菜',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'portrait', reportType: 'log-entries' },
    unitOptions: [{ code: '#06-15/16/17/27', label: 'Unit #06-15/16/17/27', labelZh: '厨房 #06-15/16/17/27' }],
    instructions: [
      'Record the first batch washing and sanitizing activity for fruits and vegetables once a day.',
      'Confirm the chemical suction tube and dispenser pump condition before washing.',
      'Record contact time, cleanliness result, status, checker name and monthly remarks when needed.'
    ],
    instructionsZh: [
      '每日记录第一批水果和蔬菜清洗与消毒活动。',
      '清洗前确认吸入管及化学品分配泵状态正常。',
      '记录接触时间、清洗结果、状态、检查人及需要时的月度备注。'
    ],
    fields: [
      f('date', 'Date', '日期', 'date'),
      f('time', 'Time', '时间', 'time'),
      f('pumpReady', 'Suction tube below chemical level, dispenser pump working and chemical level adequate?', '吸入管低于化学品液位，化学品分配泵工作正常且化学品液位充足？', 'yes_no'),
      f('contactTime', 'Contact Time (mins)', '接触时间（分钟）', 'select', {
        options: [
          { value: '4', label: '4' },
          { value: '5', label: '5' },
          { value: '6', label: '6' }
        ]
      }),
      f('foreignParticlesFree', 'Free from foreign particles after washing?', '清洗后没有异物？', 'yes_no'),
      f('status', 'Status (P / F)', '状态（合格/不合格）', 'pass_fail'),
      f('checkedBy', 'Checked by', '检测人', 'text', { maxLength: 120 })
    ],
    footerFields: [
      f('remarks', 'Remarks', '备注', 'textarea', { maxLength: 4000 }),
      f('verifiedByText', 'Verified By', '验证', 'text', { maxLength: 120 })
    ]
  },
  {
    code: 'CAC-SOP-03-F06', revision: '00', title: 'Verification of Fruits and Vegetables PPM Dispenser Pump Record', titleZh: '水果和蔬菜 PPM 分配泵验证记录',
    formType: 'log_entries',
    periodType: 'monthly',
    category: 'Fruits & Vegetables',
    categoryZh: '水果与蔬菜',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'portrait', reportType: 'log-entries' },
    unitOptions: [{ code: '#06-15/16/17/27', label: 'Unit #06-15/16/17/27', labelZh: '厨房 #06-15/16/17/27' }],
    instructions: [
      'Record each weekly validation of the fruits and vegetables PPM dispenser pump as a separate row.',
      'Select the location, record the chlorine test strip reading and checker name, and note any remarks if required.'
    ],
    instructionsZh: [
      '每次每周水果和蔬菜 PPM 分配泵验证需单独记录一行。',
      '选择地点，记录氯测试纸读数和检查人姓名，并在需要时填写备注。'
    ],
    fields: [
      f('date', 'Date', '日期', 'date'),
      f('verificationTime', 'Verification time', '验证时间', 'time'),
      f('location', 'Location', '地点', 'text', { maxLength: 180 }),
      f('chlorineReading', 'Reading on chlorine test strip (50 - 100 ppm)', '氯测试纸上的读数（50 - 100 ppm）', 'text', { maxLength: 80 }),
      f('checkedBy', 'Checked by', '检测人', 'text', { maxLength: 120 }),
      f('remarks', 'Remarks', '备注', 'text', { maxLength: 400 })
    ],
    footerFields: [
      f('verifiedByText', 'Verified By', '验证', 'text', { maxLength: 120 })
    ]
  }
];

function normalizeTemplate(template) {
  return {
    formType: 'matrix_monthly',
    periodType: 'monthly',
    category: 'Cleaning & Maintenance',
    categoryZh: '清洁与维护',
    categoryTa: '',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'landscape', reportType: 'monthly-grid' },
    instructionsZh: [],
    instructionsTa: [],
    taUnitCodes: [],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' }, weekly: { en: 'Weekly', zh: '每周' } },
    ...template
  };
}

const TEMPLATES = RAW_TEMPLATES.map(normalizeTemplate);

const TEMPLATE_BY_CODE = new Map(TEMPLATES.map((template) => [template.code, template]));
const TEMPLATE_BY_UNIT = new Map(TEMPLATES.flatMap((template) => template.unitOptions.map((unit) => [unit.code, template])));
const DEFAULT_TEMPLATE = TEMPLATE_BY_CODE.get('CAC-PRP-07-F01-B');
const DEFAULT_TEMPLATE_CODE = DEFAULT_TEMPLATE.code;
const DEFAULT_UNIT_CODE = DEFAULT_TEMPLATE.unitOptions[0].code;

function getDaysInMonth(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!match) return 31;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

function getWeekCount(monthKey) {
  return Math.ceil(getDaysInMonth(monthKey) / 7);
}

function getTemplateByCode(code) {
  return TEMPLATE_BY_CODE.get(code) || DEFAULT_TEMPLATE;
}

function getTemplateByUnit(unitCode) {
  return TEMPLATE_BY_UNIT.get(unitCode) || DEFAULT_TEMPLATE;
}

function getUnit(template, unitCode) {
  return (template.unitOptions || []).find((unit) => unit.code === unitCode) || template.unitOptions[0];
}

function buildEmptySectionState(section, monthKey) {
  const count = section.frequency === 'weekly' ? getWeekCount(monthKey) : getDaysInMonth(monthKey);
  const checks = {};
  for (const checklistItem of section.items) checks[checklistItem.id] = Array.from({ length: count }, () => false);
  return { remarks: '', checks, lastEditedAt: null, lastEditedById: '', lastEditedByName: '' };
}

function buildEmptyMonthData(template, monthKey) {
  if (template.formType === 'log_entries') {
    return {
      entries: [],
      footer: Object.fromEntries((template.footerFields || []).map((field) => [field.id, ''])),
      lastEditedAt: null,
      lastEditedById: '',
      lastEditedByName: ''
    };
  }
  const data = {};
  for (const section of template.sections) data[section.id] = buildEmptySectionState(section, monthKey);
  return data;
}

function sanitizeMonthData(template, input, monthKey) {
  if (template.formType === 'log_entries') {
    const source = input && typeof input === 'object' ? input : {};
    const entries = Array.isArray(source.entries) ? source.entries : [];
    const fields = Array.isArray(template.fields) ? template.fields : [];
    const footerFields = Array.isArray(template.footerFields) ? template.footerFields : [];
    return {
      entries: entries.map((entry, index) => {
        const cleanEntry = {
          id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim().slice(0, 64) : `entry-${index + 1}`
        };
        for (const field of fields) cleanEntry[field.id] = sanitizeLogFieldValue(field, entry && entry[field.id]);
        return cleanEntry;
      }),
      footer: Object.fromEntries(footerFields.map((field) => {
        const legacyValue = source[field.id];
        const nextValue = source.footer && Object.prototype.hasOwnProperty.call(source.footer, field.id)
          ? source.footer[field.id]
          : legacyValue;
        return [field.id, sanitizeLogFieldValue(field, nextValue)];
      })),
      lastEditedAt: source.lastEditedAt || null,
      lastEditedById: typeof source.lastEditedById === 'string' ? source.lastEditedById : '',
      lastEditedByName: typeof source.lastEditedByName === 'string' ? source.lastEditedByName : ''
    };
  }
  const source = input && typeof input === 'object' ? input : {};
  const clean = {};
  for (const section of template.sections) {
    const sectionInput = source[section.id] && typeof source[section.id] === 'object' ? source[section.id] : {};
    const count = section.frequency === 'weekly' ? getWeekCount(monthKey) : getDaysInMonth(monthKey);
    const checks = {};
    for (const checklistItem of section.items) {
      const values = Array.isArray(sectionInput.checks && sectionInput.checks[checklistItem.id]) ? sectionInput.checks[checklistItem.id] : [];
      checks[checklistItem.id] = Array.from({ length: count }, (_, index) => Boolean(values[index]));
    }
    clean[section.id] = {
      remarks: typeof sectionInput.remarks === 'string' ? sectionInput.remarks.trim().slice(0, 4000) : '',
      checks,
      lastEditedAt: sectionInput.lastEditedAt || null,
      lastEditedById: typeof sectionInput.lastEditedById === 'string' ? sectionInput.lastEditedById : '',
      lastEditedByName: typeof sectionInput.lastEditedByName === 'string' ? sectionInput.lastEditedByName : ''
    };
  }
  return clean;
}

function calculateProgress(template, data, monthKey) {
  if (template.formType === 'log_entries') {
    const clean = sanitizeMonthData(template, data, monthKey);
    const completedCells = clean.entries.filter((entry) => (template.fields || []).some((field) => {
      const value = entry[field.id];
      return value !== '' && value != null;
    })).length;
    const totalCells = completedCells;
    return { completedCells, totalCells, completionRate: completedCells ? 100 : 0 };
  }
  const clean = sanitizeMonthData(template, data, monthKey);
  let completedCells = 0;
  let totalCells = 0;
  for (const section of template.sections) {
    const count = section.frequency === 'weekly' ? getWeekCount(monthKey) : getDaysInMonth(monthKey);
    totalCells += section.items.length * count;
    for (const checklistItem of section.items) {
      for (const value of (clean[section.id].checks[checklistItem.id] || [])) {
        if (value) completedCells++;
      }
    }
  }
  return { completedCells, totalCells, completionRate: totalCells ? Math.round((completedCells / totalCells) * 100) : 0 };
}

module.exports = {
  TEMPLATES,
  DEFAULT_TEMPLATE,
  DEFAULT_TEMPLATE_CODE,
  DEFAULT_UNIT_CODE,
  getTemplateByCode,
  getTemplateByUnit,
  getUnit,
  getDaysInMonth,
  getWeekCount,
  buildEmptyMonthData,
  sanitizeMonthData,
  calculateProgress,
  sanitizeLogFieldValue
};
