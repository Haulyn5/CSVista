export type ColumnSettings = {
  width: number;
  wrap: boolean;
};

export type ColumnVisibility = Record<string, boolean>;
export type ColumnSettingsByName = Record<string, ColumnSettings>;

export type TableLayout = {
  columnOrder: string[];
  visibleColumns: ColumnVisibility;
  columnSettings: ColumnSettingsByName;
};

