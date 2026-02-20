function Equipment(name, type, status) {
    this.name = name;
    this.type = type;
    this.status = status;
}

const equipmentList = [];

function addEquipment(name, type, status) {
    const newEquipment = new Equipment(name, type, status);
    equipmentList.push(newEquipment);
}

function updateEquipment(index, updatedData) {
    if (index >= 0 && index < equipmentList.length) {
        equipmentList[index] = { ...equipmentList[index], ...updatedData };
    }
}

function getEquipment(index) {
    if (index >= 0 && index < equipmentList.length) {
        return equipmentList[index];
    }
    return null;
}

function getAllEquipment() {
    return equipmentList;
}

window.addEquipment = addEquipment;
window.updateEquipment = updateEquipment;
window.getEquipment = getEquipment;
window.getAllEquipment = getAllEquipment;