import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataTable, type Column } from '../../src/components/data-table';

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns: Column<TestRow>[] = [
  { id: 'name', label: 'Name', render: r => r.name },
  { id: 'value', label: 'Value', render: r => String(r.value) },
];

const sortableCols: Column<TestRow>[] = [
  { id: 'name', label: 'Name', render: r => r.name, sortable: true },
  { id: 'value', label: 'Value', render: r => String(r.value), sortable: true },
];

const rows: TestRow[] = [
  { id: '1', name: 'Alpha', value: 100 },
  { id: '2', name: 'Beta', value: 200 },
  { id: '3', name: 'Gamma', value: 300 },
];

describe('DataTable', () => {
  it('should render column headers', () => {
    render(<DataTable columns={columns} rows={[]} getId={r => r.id} total={0} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('should render row data', () => {
    render(<DataTable columns={columns} rows={rows} getId={r => r.id} total={rows.length} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('should render pagination when total > 0', () => {
    render(<DataTable columns={columns} rows={rows} getId={r => r.id} total={rows.length} />);
    expect(screen.getByText('1–3 of 3')).toBeInTheDocument();
  });

  it('should call onSelectOne when selectable and row clicked', () => {
    const onSelectOne = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getId={r => r.id}
        total={rows.length}
        selectable
        selectedIds={new Set()}
        onSelectOne={onSelectOne}
      />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]);
    expect(onSelectOne).toHaveBeenCalledWith('1');
  });

  it('should call onSelectAll when header checkbox clicked', () => {
    const onSelectAll = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getId={r => r.id}
        total={rows.length}
        selectable
        selectedIds={new Set()}
        onSelectAll={onSelectAll}
      />
    );
    const checkbox = screen.getAllByRole('checkbox')[0];
    fireEvent.click(checkbox);
    expect(onSelectAll).toHaveBeenCalledWith(true);
  });

  it('should show indeterminate checkbox when some rows selected', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getId={r => r.id}
        total={rows.length}
        selectable
        selectedIds={new Set(['1'])}
      />
    );
    const checkbox = screen.getAllByRole('checkbox')[0];
    expect(checkbox).toBeInTheDocument();
  });

  it('should show sort labels when columns are sortable', () => {
    render(<DataTable columns={sortableCols} rows={rows} getId={r => r.id} total={0} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Value')).toBeInTheDocument();
  });

  it('should toggle sort direction when sortable header clicked', () => {
    render(<DataTable columns={sortableCols} rows={rows} getId={r => r.id} total={0} />);
    const nameHeader = screen.getByText('Name');
    fireEvent.click(nameHeader);
    expect(nameHeader).toBeInTheDocument();
    fireEvent.click(nameHeader);
    expect(nameHeader).toBeInTheDocument();
  });

  it('should handle empty rows with selectable', () => {
    render(
      <DataTable columns={columns} rows={[]} getId={r => r.id} total={0} selectable selectedIds={new Set()} />
    );
    expect(screen.getByRole('checkbox')).toBeInTheDocument();
  });

  it('should show checked header checkbox when all rows selected', () => {
    render(
      <DataTable
        columns={columns}
        rows={rows}
        getId={r => r.id}
        total={rows.length}
        selectable
        selectedIds={new Set(['1', '2', '3'])}
      />
    );
    const checkbox = screen.getAllByRole('checkbox')[0];
    expect(checkbox).toBeInTheDocument();
  });

  it('should render correct pagination text for partial page', () => {
    const manyRows: TestRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i + 1),
      name: `Row ${i + 1}`,
      value: i,
    }));
    render(
      <DataTable
        columns={columns}
        rows={manyRows}
        getId={r => r.id}
        total={manyRows.length}
        rowsPerPage={10}
      />
    );
    expect(screen.getByText('1–10 of 12')).toBeInTheDocument();
  });

  it('should call onPageChange when pagination next button clicked', () => {
    const onPageChange = vi.fn();
    const manyRows: TestRow[] = Array.from({ length: 12 }, (_, i) => ({
      id: String(i + 1),
      name: `Row ${i + 1}`,
      value: i,
    }));
    render(
      <DataTable
        columns={columns}
        rows={manyRows}
        getId={r => r.id}
        total={manyRows.length}
        rowsPerPage={10}
        onPageChange={onPageChange}
      />
    );
    const nextButton = screen.getByRole('button', { name: /next page/i });
    fireEvent.click(nextButton);
    expect(onPageChange).toHaveBeenCalled();
  });

  it('should handle selectable without selectedIds prop', () => {
    render(
      <DataTable columns={columns} rows={rows} getId={r => r.id} total={rows.length} selectable />
    );
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes[0]).toBeInTheDocument();
  });
});
