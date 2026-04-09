const ORDER_MANAGER_KITCHEN_STATIONS = {
  combioven: {
    key: "combioven",
    title: "Equipment Temp Monitor",
    boardTitle: "烤炉订单 Combi Oven Orders",
    pageTitle: "设备温度监控 Equipment Temp Monitor",
    selectorTitle: "Combi Oven Cooking Log",
    sourceLabel: "combi oven"
  },
  stirfry: {
    key: "stirfry",
    title: "Stir-Fried Equipment Temp Monitor",
    boardTitle: "炒部门订单 Stir-Fried Orders",
    pageTitle: "炒部门设备温度监控 Stir-Fried Equipment Temp Monitor",
    selectorTitle: "Stir-Fried Cooking Log",
    sourceLabel: "stir-fried department"
  }
};

window.ORDER_MANAGER_KITCHEN_STATIONS = ORDER_MANAGER_KITCHEN_STATIONS;

function getKitchenStationConfig() {
  const station = String(new URLSearchParams(window.location.search).get("station") || "combioven").trim().toLowerCase();
  return ORDER_MANAGER_KITCHEN_STATIONS[station] || ORDER_MANAGER_KITCHEN_STATIONS.combioven;
}

window.ORDER_MANAGER_KITCHEN_STATION = getKitchenStationConfig();

function buildKitchenApiUrl(pathname, searchParams = null) {
  const station = window.ORDER_MANAGER_KITCHEN_STATION || ORDER_MANAGER_KITCHEN_STATIONS.combioven;
  const params = new URLSearchParams(searchParams || "");
  params.set("station", station.key);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

async function saveCookData(cookData) {
  const response = await fetch(buildKitchenApiUrl("/api/order-manager/kitchen/cooks"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cookData)
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not save cook log.");
  }

  return response.json();
}

async function loadRecentCookData() {
  const response = await fetch(buildKitchenApiUrl("/api/order-manager/kitchen/cooks", { limit: 8 }));
  if (!response.ok) {
    return [];
  }
  return response.json();
}

async function exportFullCSVData() {
  const response = await fetch(buildKitchenApiUrl("/api/order-manager/kitchen/cooks/export"));
  if (!response.ok) {
    throw new Error("Could not export cook log.");
  }
  return response.blob();
}

async function deleteCookData(sessionId) {
  const response = await fetch(buildKitchenApiUrl(`/api/order-manager/kitchen/cooks/${encodeURIComponent(sessionId)}`), {
    method: "DELETE"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not undo cook log.");
  }

  return response.json();
}
