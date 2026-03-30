function applyDemoRefreshOverlay(run, rows, options = {}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (!shouldApplyDemo(run, sourceRows)) {
    return {
      rows: sourceRows,
      refreshSummary: run.refreshSummary || null
    };
  }

  const preferredChefPattern = options.preferredChefPattern || null;
  const reportDate = run.reportDate;
  const nextRows = sourceRows.map((row) => ({ ...row }));
  const candidates = pickCandidateIndexes(nextRows, reportDate, preferredChefPattern);
  if (!candidates.length) {
    return {
      rows: sourceRows,
      refreshSummary: run.refreshSummary || null
    };
  }

  if (candidates[0] !== undefined) {
    const row = nextRows[candidates[0]];
    nextRows[candidates[0]] = {
      ...row,
      qty: String(Number(row.qty || 0) + 8),
      functionTime: "08:00AM",
      functionTimeLabel: "AM 8:00",
      notes: `${row.notes || ""} [SIMULATED EDIT 8PM] Qty increased after customer revision.`.trim(),
      isEdited: true,
      isNewAtRefresh: false,
      hasAlert: true,
      changeAlertLabel: "改单！",
      changedFields: ["qty", "functionTime", "functionTimeLabel", "notes"]
    };
  }

  if (candidates[1] !== undefined) {
    const row = nextRows[candidates[1]];
    nextRows[candidates[1]] = {
      ...row,
      eventType: `${row.eventType || "Event"} [Edited]`,
      notes: `${row.notes || ""} [SIMULATED EDIT 8PM] Allergens and delivery notes updated.`.trim(),
      isEdited: true,
      isNewAtRefresh: false,
      hasAlert: true,
      changeAlertLabel: "改单！",
      changedFields: ["eventType", "notes"]
    };
  }

  const baseRow = nextRows[candidates[2] !== undefined ? candidates[2] : candidates[0]];
  nextRows.push({
    ...baseRow,
    id: `${reportDate}||06:45AM||SIM9001||模拟加单 (Simulated Add-on Order)`,
    reportDate,
    prepTime: "06:45AM",
    prepTimeLabel: "AM 6:30",
    functionTime: "09:15AM",
    functionTimeLabel: "AM 9:00",
    qty: "12",
    orderNumber: "SIM9001",
    dish: preferredChefPattern ? "烤炉模拟加单 (Simulated Oven Add-on Order)" : "模拟加单 (Simulated Add-on Order)",
    eventType: "Simulated Refresh Edit",
    notes: "Simulated 8PM add-on order for UI testing only.",
    chefCellValue: "12",
    chefCellTime: "AM 6:30",
    chefCellRawTime: "6:30",
    isEdited: false,
    isNewAtRefresh: true,
    hasAlert: true,
    changeAlertLabel: "加单！",
    changedFields: []
  });

  const editedRowCount = nextRows.filter((row) => row.isEdited).length;
  const newRowCount = nextRows.filter((row) => row.isNewAtRefresh).length;
  const unchangedRowCount = nextRows.length - editedRowCount - newRowCount;

  return {
    rows: nextRows,
    refreshSummary: {
      baselineRunId: run.refreshSummary ? run.refreshSummary.baselineRunId : (run.baselineRunId || ""),
      baselineExtractedAt: run.refreshSummary ? run.refreshSummary.baselineExtractedAt : "",
      editedRowCount,
      newRowCount,
      unchangedRowCount
    }
  };
}

function shouldApplyDemo(run, rows) {
  const simulateDate = process.env.ORDER_MANAGER_SIMULATE_REFRESH_DATE || "";
  if (!simulateDate) {
    return false;
  }

  if (!run || run.runType !== "daily_refresh" || run.reportDate !== simulateDate) {
    return false;
  }

  return !rows.some((row) => row.hasAlert);
}

function pickCandidateIndexes(rows, reportDate, preferredChefPattern) {
  const preferred = [];
  const fallback = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.reportDate !== reportDate || row.unmatchedReason) {
      continue;
    }

    if (preferredChefPattern && preferredChefPattern.test(String(row.chef || ""))) {
      preferred.push(index);
    } else {
      fallback.push(index);
    }
  }

  const merged = [...preferred, ...fallback];
  return Array.from(new Set(merged)).slice(0, 3);
}

module.exports = {
  applyDemoRefreshOverlay
};
