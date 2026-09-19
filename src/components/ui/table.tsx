/**
 * The one table.
 *
 * Three hand-rolled `<table>`s existed: the roster on `cohorts/[id]`, and the column-mapping and
 * row-preview tables inside `roster-upload-flow.tsx`. All three had the same scroll shell, the
 * same header fill, the same 16/12 cell padding and the same hairline row rule — and all three
 * had to remember `<caption class="sr-only">` and `scope="col"` by hand. Here the caption and
 * the scope are structural: you cannot render this table without them.
 *
 * `headers` is a plain string array rather than a children slot because all three call sites had
 * plain-text headers, and because `cohorts/[id]/page.test.tsx` asserts the exact list
 * `getAllByRole("columnheader").map(cell => cell.textContent)` comes back — an extra wrapper
 * element inside a `<th>` would not change that, but an accidental extra `<th>` would, and a
 * typed array makes that impossible to do by accident.
 */

import type { ReactNode } from "react";

export interface TableProps {
  /**
   * Required. Screen-reader-only, as on all three originals — a sighted user already has the
   * section heading above the table.
   */
  readonly caption: string;
  readonly headers: readonly string[];
  readonly children: ReactNode;
  readonly className?: string;
}

export function Table({ caption, headers, children, className }: TableProps) {
  return (
    <div
      className={[
        "overflow-x-auto rounded-card border border-hairline-lilac bg-surface-card",
        className ?? "",
      ]
        .filter((part) => part.length > 0)
        .join(" ")}
    >
      <table className="w-full text-left text-copy">
        <caption className="sr-only">{caption}</caption>
        <thead className="bg-surface-warm-gray text-meta font-bold text-text-secondary">
          <tr>
            {headers.map((header) => (
              <th key={header} scope="col" className="px-16 py-12">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export interface TableRowProps {
  readonly children: ReactNode;
  readonly "aria-invalid"?: boolean;
  readonly "aria-describedby"?: string;
  readonly className?: string;
}

export function TableRow({ children, className, ...rest }: TableRowProps) {
  return (
    <tr
      {...rest}
      className={["border-t border-hairline-lilac", className ?? ""]
        .filter((part) => part.length > 0)
        .join(" ")}
    >
      {children}
    </tr>
  );
}

/** `primary` for the column a reader scans down, `secondary` for the supporting ones. */
export type TableCellTone = "primary" | "secondary";

const TONE_CLASS: Readonly<Record<TableCellTone, string>> = {
  primary: "text-text-primary",
  secondary: "text-text-secondary",
};

export interface TableCellProps {
  readonly children: ReactNode;
  readonly tone?: TableCellTone;
  readonly className?: string;
  readonly colSpan?: number;
}

export function TableCell({ children, tone = "secondary", className, colSpan }: TableCellProps) {
  return (
    <td
      colSpan={colSpan}
      className={["px-16 py-12", TONE_CLASS[tone], className ?? ""]
        .filter((part) => part.length > 0)
        .join(" ")}
    >
      {children}
    </td>
  );
}

/** A single spanning row for "this table has nothing in it", inside the table's own structure. */
export function TableEmptyRow({
  colSpan,
  children,
}: {
  readonly colSpan: number;
  readonly children: ReactNode;
}) {
  return (
    <tr>
      <TableCell colSpan={colSpan}>{children}</TableCell>
    </tr>
  );
}

export default Table;
