'use strict';

const sharedInstructions = [
  'Employee to tick each checklist after cleaning and disinfecting according to required frequency.',
  'Employee to check the condition of breakable items and tick if condition is acceptable.',
  'Employee to update the respective supervisor or manager for any equipment failure or required maintenance and record it in the remarks column.',
  'Additional cleaning and disinfection may be done when necessary without recording a tick on the form.'
];

function i(id, label, labelZh) { return { id, label, labelZh: labelZh || '' }; }
function s(id, title, titleZh, frequency, items) { return { id, title, titleZh: titleZh || '', frequency, items }; }
function f(id, label, labelZh, type, options) { return { id, label, labelZh: labelZh || '', type, ...(options || {}) }; }

const RAW_TEMPLATES = [
  {
    code: 'CAC-PRP-07-F01-A', revision: '01', title: 'Equipment Cleanliness and Maintenance Checklist', titleZh: '器具清洁和维护清单',
    unitOptions: [{ code: '#06-24', label: 'Unit #06-24', labelZh: '厨房 #06-24' }], instructions: sharedInstructions, instructionsZh: [],
    frequencyLabels: { daily: { en: 'Daily', zh: '每日' }, weekly: { en: 'Weekly', zh: '每周' } },
    sections: [
      s('seafood', 'Seafood Processing Room', '海鲜加工房', 'daily', [i('door','Door knobs, buttons or latches','门把手、按钮或门闩'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('meat', 'Meat Processing Room', '肉类加工房', 'daily', [i('door','Door knobs, buttons or latches','门把手、按钮或门闩'), i('sink','Hand wash basins or kitchen sinks','洗手盆或厨房水槽'), i('app','Kitchen appliances (mixer, tumbler, etc.)','厨房设备'), i('equip','Kitchen equipment (cabinet, shelves, table, trolley, etc.)','厨房硬件'), i('small','Kitchen smallwares (chopping board, GN pan, knife, cooking utensils, etc.)','厨房小件'), i('break','Breakable container and wooden handled equipment','易碎容器和木柄器具'), i('disp','Dispensers (hand soap, sanitizer, paper towel, etc.)','容器'), i('bins','Refuse bins','垃圾桶'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('store', 'Dry Store / Packaging Material Store / Walk-in Chiller & Freezer', '仓库 / 包装材料室 / 冷藏冷冻室', 'daily', [i('door','Door knobs, buttons or latches','门把手、按钮或门闩'), i('equip','Storage area equipment (shelves, trolley, etc.)','存储区设备'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('footbath', 'Foot Bath', '脚踏消毒池', 'daily', [i('floor','Walls, floor and floor traps','墙壁、地面和地漏'), i('time','Time record, water change within 4h','时间记录，4小时内换水')]),
      s('sump', 'Sump Room', '污水房', 'daily', [i('waste','Waste sieve','废筛'), i('floor','Walls, floor and floor traps','墙壁、地面和地漏')]),
      s('changing', 'Changing Room', '更衣室', 'daily', [i('equip','Changing room equipment (locker, mirror, etc.)','更衣室设备')]),
      s('toilet', 'Toilet', '洗手间', 'daily', [i('clean','Toilets are clean, dry, well-ventilated and in good repair','洗手间干净、干燥、通风良好且维护良好'), i('fit','Toilet fittings facilities are in good working condition and repair','洗手间设施运行良好'), i('amen','Basic amenities such as soap, toilet paper, paper towel and waste bins are available','基本用品已提供')]),
      s('weekly', 'All Areas', '全部区域', 'weekly', [i('switch','Switches or power points','开关或电源插座'), i('door','Door surfaces, frames, closers or curtains','门表面、门框、闭门器或门帘'), i('fan','Evaporator fan, ventilation fan, fresh air or exhaust hood','风扇/排风/抽油烟罩'), i('fire','Fire extinguishers and electrical switch boxes','灭火器和电器开关箱'), i('columns','Columns, ceilings and overhead fixtures','柱子、天花板及高处装置')])
    ]
  },
  {
    code: 'CAC-PRP-07-F01-B', revision: '01', title: 'Equipment Cleanliness and Maintenance Checklist', titleZh: '器具清洁和维护清单',
    unitOptions: [{ code: '#06-15/16/17/27', label: 'Unit #06-15/16/17/27', labelZh: '厨房 #06-15/16/17/27' }], instructions: sharedInstructions, instructionsZh: [],
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
    unitOptions: [{ code: '#06-19', label: 'Unit #06-19', labelZh: '厨房 #06-19' }], instructions: sharedInstructions, instructionsZh: [],
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
    unitOptions: [{ code: '#06-08', label: 'Unit #06-08', labelZh: '厨房 #06-08' }], instructions: sharedInstructions, instructionsZh: [],
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
    unitOptions: [{ code: '#05-26', label: 'Unit #05-26', labelZh: '厨房 #05-26' }], instructions: sharedInstructions, instructionsZh: [],
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
    unitOptions: [{ code: '#05-27', label: 'Unit #05-27', labelZh: '厨房 #05-27' }], instructions: sharedInstructions, instructionsZh: [],
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
    code: 'CAC-PRP-07-F02', revision: '00', title: 'Daily Vehicle Cleanliness Checklist', titleZh: '每日车辆清洁检查表',
    formType: 'matrix_monthly',
    periodType: 'monthly',
    category: 'Vehicle Hygiene',
    categoryZh: '车辆卫生',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'landscape', reportType: 'monthly-grid' },
    unitOptions: [
      { code: 'GBA2807Y', label: 'Vehicle GBA2807Y', labelZh: '车辆 GBA2807Y' },
      { code: 'GBD4397J', label: 'Vehicle GBD4397J', labelZh: '车辆 GBD4397J' },
      { code: 'GBD9017Z', label: 'Vehicle GBD9017Z', labelZh: '车辆 GBD9017Z' },
      { code: 'GBE1650S', label: 'Vehicle GBE1650S', labelZh: '车辆 GBE1650S' }
    ],
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
  }
];

function normalizeTemplate(template) {
  return {
    formType: 'matrix_monthly',
    periodType: 'monthly',
    category: 'Cleaning & Maintenance',
    categoryZh: '清洁与维护',
    periodLabel: 'Monthly',
    periodLabelZh: '每月',
    paper: { paperSize: 'A4', orientation: 'landscape', reportType: 'monthly-grid' },
    instructionsZh: [],
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
      remarks: '',
      verifiedByText: '',
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
    return {
      entries: entries.map((entry, index) => ({
        id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim().slice(0, 64) : `entry-${index + 1}`,
        date: /^\d{4}-\d{2}-\d{2}$/.test(String(entry.date || '').trim()) ? String(entry.date).trim() : '',
        quantity: Number.isFinite(Number(entry.quantity)) && Number(entry.quantity) >= 0 ? Number(entry.quantity) : '',
        covered: ['Y', 'N'].includes(String(entry.covered || '').toUpperCase()) ? String(entry.covered).toUpperCase() : '',
        fragments: ['Y', 'N'].includes(String(entry.fragments || '').toUpperCase()) ? String(entry.fragments).toUpperCase() : '',
        cleanDry: ['Y', 'N'].includes(String(entry.cleanDry || '').toUpperCase()) ? String(entry.cleanDry).toUpperCase() : '',
        status: ['P', 'F'].includes(String(entry.status || '').toUpperCase()) ? String(entry.status).toUpperCase() : '',
        checkedBy: typeof entry.checkedBy === 'string' ? entry.checkedBy.trim().slice(0, 120) : ''
      })),
      remarks: typeof source.remarks === 'string' ? source.remarks.trim().slice(0, 4000) : '',
      verifiedByText: typeof source.verifiedByText === 'string' ? source.verifiedByText.trim().slice(0, 120) : '',
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
    const completedCells = clean.entries.filter((entry) => entry.date || entry.quantity !== '' || entry.checkedBy).length;
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
  calculateProgress
};
