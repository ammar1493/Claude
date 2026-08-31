"use client";

import { useMemo } from "react";
import { Card } from "@/components/Card";
import { DataTable, type Column } from "@/components/DataTable";
import { validFilteredDf } from "@/lib/selectors";
import type { TrainingRow } from "@/lib/types";
import { useDashboard } from "@/state/DashboardContext";

export function RawDataTable() {
  const { dataset, filters } = useDashboard();

  const rows = useMemo(() => validFilteredDf(dataset.rows, filters), [dataset.rows, filters]);

  const columns: Column<TrainingRow>[] = useMemo(() => {
    const names = dataset.columns.length ? dataset.columns : rows.length ? Object.keys(rows[0].extra) : [];
    return names.map((name, i) => ({
      key: `c${i}`,
      header: name,
      value: (r) => {
        const v = r.extra[name];
        return v === null || v === undefined ? "" : (v as string | number);
      },
    }));
  }, [dataset.columns, rows]);

  return (
    <Card title="Raw Data View" className="min-h-[700px]" inset>
      <DataTable
        rows={rows}
        columns={columns}
        pageLength={15}
        filterRow
        emptyMessage="No rows match the current filters"
      />
    </Card>
  );
}
