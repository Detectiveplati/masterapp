async function saveCookData(cookData) {
  const response = await fetch("/api/order-manager/kitchen/cooks", {
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
  const response = await fetch("/api/order-manager/kitchen/cooks?limit=8");
  if (!response.ok) {
    return [];
  }
  return response.json();
}

async function exportFullCSVData() {
  const response = await fetch("/api/order-manager/kitchen/cooks/export");
  if (!response.ok) {
    throw new Error("Could not export cook log.");
  }
  return response.blob();
}

async function deleteCookData(sessionId) {
  const response = await fetch(`/api/order-manager/kitchen/cooks/${encodeURIComponent(sessionId)}`, {
    method: "DELETE"
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Could not undo cook log.");
  }

  return response.json();
}
