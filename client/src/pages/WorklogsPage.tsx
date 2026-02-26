import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { useWorklogsStream, useBudget, type WorklogEntry } from '@/hooks/useWorklogs';
import { useAppStore } from '@/store/appStore';
import { formatCurrency, formatHours, formatDate } from '@/lib/utils';
import { Settings, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface IssueGroup {
  issueKey: string | undefined;
  issueSummary: string | undefined;
  totalHours: number;
  totalRevenue: number;
  entries: WorklogEntry[];
}

interface UserGroup {
  accountId: string;
  displayName: string;
  role: string | undefined;
  billingRate: number;
  rateSource: string;
  totalHours: number;
  totalRevenue: number;
  issues: IssueGroup[];
}

interface BudgetData {
  amount: { value: number; currencyCode: string };
}

function RateSourceBadge({ source }: { source?: string }) {
  if (source === 'override') return <Badge className="ml-1 text-xs bg-blue-100 text-blue-800 border-0">override</Badge>;
  if (source === 'global') return <Badge variant="secondary" className="ml-1 text-xs">global</Badge>;
  if (source === 'project-default') return <Badge className="ml-1 text-xs bg-purple-100 text-purple-800 border-0">project default</Badge>;
  return <Badge variant="destructive" className="ml-1 text-xs">none</Badge>;
}

export function WorklogsPage() {
  const { activePeriod, setActivePeriod, selectedProject, credentialsConfigured } = useAppStore();
  const { isLoading, progress, message, data, error } = useWorklogsStream();
  const { data: budgetData } = useBudget();

  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [expandedIssues, setExpandedIssues] = useState<Set<string>>(new Set());

  const budget = budgetData as BudgetData | undefined;

  const userGroups = useMemo<UserGroup[]>(() => {
    if (!data) return [];

    const byUser = new Map<string, WorklogEntry[]>();
    for (const entry of data) {
      const list = byUser.get(entry.accountId) ?? [];
      list.push(entry);
      byUser.set(entry.accountId, list);
    }

    const groups: UserGroup[] = [];
    for (const [accountId, entries] of byUser) {
      const byIssue = new Map<string, WorklogEntry[]>();
      for (const entry of entries) {
        const key = entry.issueKey ?? '__no_issue__';
        const list = byIssue.get(key) ?? [];
        list.push(entry);
        byIssue.set(key, list);
      }

      const issues: IssueGroup[] = [];
      for (const [issueKey, issueEntries] of byIssue) {
        issues.push({
          issueKey: issueKey === '__no_issue__' ? undefined : issueKey,
          issueSummary: issueEntries[0].issueSummary,
          totalHours: issueEntries.reduce((s, e) => s + e.hours, 0),
          totalRevenue: issueEntries.reduce((s, e) => s + (e.revenue ?? 0), 0),
          entries: [...issueEntries].sort((a, b) => b.startDate.localeCompare(a.startDate)),
        });
      }
      issues.sort((a, b) => (a.issueKey ?? '').localeCompare(b.issueKey ?? ''));

      const totalHours = entries.reduce((s, e) => s + e.hours, 0);
      const totalRevenue = entries.reduce((s, e) => s + (e.revenue ?? 0), 0);
      groups.push({
        accountId,
        displayName: entries[0].displayName,
        role: entries[0].role,
        billingRate: entries[0].billingRate ?? 0,
        rateSource: entries[0].rateSource ?? 'none',
        totalHours,
        totalRevenue,
        issues,
      });
    }
    return groups.sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [data]);

  const totalHours = useMemo(() => userGroups.reduce((s, u) => s + u.totalHours, 0), [userGroups]);
  const totalRevenue = useMemo(() => userGroups.reduce((s, u) => s + u.totalRevenue, 0), [userGroups]);

  function toggleUser(accountId: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  function toggleIssue(accountId: string, issueKey: string | undefined) {
    const key = `${accountId}:${issueKey ?? '__no_issue__'}`;
    setExpandedIssues((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {data ? formatHours(totalHours) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-700">
              {data ? formatCurrency(totalRevenue) : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Budget</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {budget ? formatCurrency(budget.amount.value) : '—'}
            </p>
            {budget && data && (
              <p className="text-xs text-muted-foreground mt-1">
                {formatCurrency(budget.amount.value - totalRevenue)} remaining
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Worklog Tree */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Worklog Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="px-6 py-8 space-y-3">
              <Progress value={progress} className="h-2" />
              <p className="text-sm text-muted-foreground text-center">{message}</p>
            </div>
          ) : error ? (
            <div className="px-6 py-8 text-center text-destructive text-sm">{error}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userGroups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {selectedProject
                        ? 'No worklogs found for this period'
                        : 'Select a project in Settings to view worklogs'}
                    </TableCell>
                  </TableRow>
                ) : (
                  userGroups.map((user) => {
                    const userExpanded = expandedUsers.has(user.accountId);
                    return (
                      <React.Fragment key={user.accountId}>
                        {/* User row */}
                        <TableRow
                          className="cursor-pointer hover:bg-muted/50 font-medium"
                          onClick={() => toggleUser(user.accountId)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {userExpanded
                                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                              {user.displayName}
                            </div>
                          </TableCell>
                          <TableCell>{user.role ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          <TableCell>{formatHours(user.totalHours)}</TableCell>
                          <TableCell>
                            <div className="flex items-center flex-wrap gap-1">
                              <span>{formatCurrency(user.billingRate)}</span>
                              <RateSourceBadge source={user.rateSource} />
                            </div>
                          </TableCell>
                          <TableCell className="font-medium text-green-700">
                            {formatCurrency(user.totalRevenue)}
                          </TableCell>
                        </TableRow>

                        {/* Issue rows */}
                        {userExpanded && user.issues.map((issue) => {
                          const issueKey = `${user.accountId}:${issue.issueKey ?? '__no_issue__'}`;
                          const issueExpanded = expandedIssues.has(issueKey);
                          return (
                            <React.Fragment key={issueKey}>
                              <TableRow
                                className="cursor-pointer hover:bg-muted/30 bg-muted/10"
                                onClick={() => toggleIssue(user.accountId, issue.issueKey)}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2 pl-8">
                                    {issueExpanded
                                      ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                                      : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                                    {issue.issueKey ? (
                                      <span>
                                        <span className="font-mono text-xs bg-secondary px-1 rounded">{issue.issueKey}</span>
                                        {issue.issueSummary && (
                                          <span className="ml-2 text-xs text-muted-foreground">{issue.issueSummary}</span>
                                        )}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground text-sm">No issue</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell><span className="text-muted-foreground">—</span></TableCell>
                                <TableCell>{formatHours(issue.totalHours)}</TableCell>
                                <TableCell><span className="text-muted-foreground">—</span></TableCell>
                                <TableCell>{formatCurrency(issue.totalRevenue)}</TableCell>
                              </TableRow>

                              {/* Entry rows */}
                              {issueExpanded && issue.entries.map((entry, idx) => (
                                <TableRow key={idx} className="bg-muted/5 text-sm">
                                  <TableCell>
                                    <div className="pl-16 text-muted-foreground">
                                      {formatDate(entry.startDate)}
                                    </div>
                                  </TableCell>
                                  <TableCell><span className="text-muted-foreground">—</span></TableCell>
                                  <TableCell>{formatHours(entry.hours)}</TableCell>
                                  <TableCell><span className="text-muted-foreground">—</span></TableCell>
                                  <TableCell>{entry.revenue != null ? formatCurrency(entry.revenue) : '—'}</TableCell>
                                </TableRow>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
