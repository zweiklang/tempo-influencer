import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { useWorklogs, useRevenue, useBudget } from '@/hooks/useWorklogs';
import { useAppStore } from '@/store/appStore';
import { formatCurrency, formatHours, formatDate } from '@/lib/utils';
import { ArrowUpDown, Settings, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WorklogEntry {
  accountId: string;
  displayName: string;
  role?: string;
  issueKey?: string;
  issueSummary?: string;
  startDate: string;
  hours: number;
  billingRate?: number;
  rateSource?: 'override' | 'global' | 'project-default' | 'none';
  revenue?: number;
}

interface RevenueData {
  totalHours: number;
  totalRevenue: number;
}

interface BudgetData {
  totalBudget: number;
  budgetUsed?: number;
}

type SortField = 'displayName' | 'role' | 'issueKey' | 'startDate' | 'hours' | 'billingRate' | 'revenue';
type SortDir = 'asc' | 'desc';

function RateSourceBadge({ source }: { source?: string }) {
  if (source === 'override') return <Badge className="ml-1 text-xs bg-blue-100 text-blue-800 border-0">override</Badge>;
  if (source === 'global') return <Badge variant="secondary" className="ml-1 text-xs">global</Badge>;
  if (source === 'project-default') return <Badge className="ml-1 text-xs bg-purple-100 text-purple-800 border-0">project default</Badge>;
  return <Badge variant="destructive" className="ml-1 text-xs">none</Badge>;
}

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 7 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 bg-muted animate-pulse rounded" />
        </TableCell>
      ))}
    </TableRow>
  );
}

function SortableHead({
  field,
  label,
  currentSort,
  currentDir,
  onSort,
}: {
  field: SortField;
  label: string;
  currentSort: SortField;
  currentDir: SortDir;
  onSort: (f: SortField) => void;
}) {
  return (
    <TableHead
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 transition-opacity ${currentSort === field ? 'opacity-100' : 'opacity-30'}`}
        />
      </div>
    </TableHead>
  );
}

export function WorklogsPage() {
  const { activePeriod, setActivePeriod, selectedProject, credentialsConfigured } = useAppStore();
  const { data: worklogsData, isLoading: worklogsLoading } = useWorklogs();
  const { data: revenueData } = useRevenue();
  const { data: budgetData } = useBudget();

  const [sortField, setSortField] = useState<SortField>('startDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const worklogs = (worklogsData as WorklogEntry[]) || [];
  const revenue = revenueData as RevenueData | undefined;
  const budget = budgetData as BudgetData | undefined;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = useMemo(() => {
    return [...worklogs].sort((a, b) => {
      let av: string | number = a[sortField] ?? '';
      let bv: string | number = b[sortField] ?? '';
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [worklogs, sortField, sortDir]);

  if (!credentialsConfigured && !selectedProject) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <div className="rounded-full bg-muted p-6">
          <Settings className="h-12 w-12 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold">Setup Required</h2>
        <p className="text-muted-foreground max-w-sm">
          Configure your API credentials and select a project to start viewing worklogs.
        </p>
        <Link to="/settings">
          <Button>Go to Settings</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Worklogs</h2>
        <p className="text-muted-foreground mt-1">
          {selectedProject ? `Project: ${selectedProject.projectName}` : 'No project selected'}
        </p>
      </div>

      {/* Date Range Picker */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input
                id="from"
                type="date"
                value={activePeriod.from}
                onChange={(e) => setActivePeriod({ ...activePeriod, from: e.target.value })}
                className="w-40"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input
                id="to"
                type="date"
                value={activePeriod.to}
                onChange={(e) => setActivePeriod({ ...activePeriod, to: e.target.value })}
                className="w-40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Revenue Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {revenue ? formatHours(revenue.totalHours) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">
              {revenue ? formatCurrency(revenue.totalRevenue) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {budget ? formatCurrency(budget.totalBudget) : '—'}
            </p>
            {budget && revenue && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(budget.totalBudget - revenue.totalRevenue)} remaining
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Worklog Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Worklog Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead field="displayName" label="User" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHead field="role" label="Role" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHead field="issueKey" label="Issue" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHead field="startDate" label="Date" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHead field="hours" label="Hours" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHead field="billingRate" label="Rate" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
                <SortableHead field="revenue" label="Revenue" currentSort={sortField} currentDir={sortDir} onSort={handleSort} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {worklogsLoading
                ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                : sorted.length === 0
                ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {selectedProject
                        ? 'No worklogs found for this period'
                        : 'Select a project in Settings to view worklogs'}
                    </TableCell>
                  </TableRow>
                )
                : sorted.map((entry, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{entry.displayName}</TableCell>
                    <TableCell>{entry.role || <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>
                      {entry.issueKey ? (
                        <div>
                          <span className="font-mono text-xs bg-secondary px-1 rounded">{entry.issueKey}</span>
                          {entry.issueSummary && (
                            <p className="text-xs text-muted-foreground truncate max-w-48 mt-0.5">
                              {entry.issueSummary}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(entry.startDate)}</TableCell>
                    <TableCell>{formatHours(entry.hours)}</TableCell>
                    <TableCell>
                      <div className="flex items-center flex-wrap gap-1">
                        <span>{entry.billingRate != null ? formatCurrency(entry.billingRate) : '—'}</span>
                        <RateSourceBadge source={entry.rateSource} />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.revenue != null ? formatCurrency(entry.revenue) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
