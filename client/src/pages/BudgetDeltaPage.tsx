import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { useRevenue } from '@/hooks/useWorklogs';
import { useRoles, useBillingRates, useTeams, useTeamMembers } from '@/hooks/useTeam';
import { useOpenIssues } from '@/hooks/useIssues';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/api/apiClient';
import { formatCurrency, formatHours, formatDate } from '@/lib/utils';
import { ChevronRight, ChevronLeft, Loader2, RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RoleConfig {
  roleId: number;
  roleName: string;
  billingRate: number;
  memberCount: number;
  accountIds: string[];
}

interface HourBreakdown {
  roleId: number;
  roleName: string;
  hoursPerMember: number;
  totalHours: number;
  revenueContribution: number;
}

interface Assignment {
  accountId: string;
  displayName: string;
  issueId: number;
  issueKey: string;
  issueName: string;
  totalHours: number;
}

interface ScheduledEntry {
  accountId: string;
  displayName: string;
  issueId: number;
  issueKey: string;
  issueName: string;
  startDate: string;
  hours: number;
  overflow?: boolean;
}

interface SubmitResult {
  accountId: string;
  displayName: string;
  issueId: number;
  issueKey: string;
  startDate: string;
  hours: number;
  status: 'success' | 'error';
  error?: string;
}

interface Role {
  id: number;
  name: string;
}

interface BillingRate {
  accountId?: string;
  roleId?: number;
  rate: number;
  source: string;
}

interface BillingRatesData {
  rates: BillingRate[];
}

interface TeamMember {
  accountId: string;
  displayName: string;
  roleId?: number;
}

interface Issue {
  id: number;
  key: string;
  summary: string;
}

// ─── Step Indicator ──────────────────────────────────────────────────────────

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }).map((_, i) => (
        <React.Fragment key={i}>
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium border-2 transition-colors ${
              i + 1 === step
                ? 'bg-primary text-primary-foreground border-primary'
                : i + 1 < step
                ? 'bg-green-500 text-white border-green-500'
                : 'bg-background text-muted-foreground border-muted'
            }`}
          >
            {i + 1 < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div className={`flex-1 h-0.5 ${i + 1 < step ? 'bg-green-500' : 'bg-muted'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ─── Step 1: Target ──────────────────────────────────────────────────────────

function Step1({
  from,
  to,
  targetRevenue,
  onFromChange,
  onToChange,
  onTargetChange,
  onNext,
}: {
  from: string;
  to: string;
  targetRevenue: number;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onTargetChange: (v: number) => void;
  onNext: () => void;
}) {
  const { data: revenueData, isLoading } = useRevenue();
  const revenue = revenueData as { totalRevenue: number } | undefined;
  const currentRevenue = revenue?.totalRevenue ?? 0;
  const delta = targetRevenue - currentRevenue;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Step 1: Set Target Revenue</h3>
        <p className="text-muted-foreground text-sm mt-1">Define the period and target revenue to achieve</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => onFromChange(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => onToChange(e.target.value)} />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Current Revenue (read-only)</Label>
        <div className="flex items-center h-10 px-3 rounded-md border bg-muted text-sm">
          {isLoading ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </span>
          ) : (
            <span className="font-medium">{formatCurrency(currentRevenue)}</span>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Target Revenue (EUR)</Label>
        <Input
          type="number"
          placeholder="e.g. 50000"
          value={targetRevenue || ''}
          onChange={(e) => onTargetChange(parseFloat(e.target.value) || 0)}
        />
      </div>

      {targetRevenue > 0 && (
        <div className={`rounded-md px-4 py-3 text-sm ${delta > 0 ? 'bg-blue-50 text-blue-800' : 'bg-yellow-50 text-yellow-800'}`}>
          {delta > 0
            ? `Need to generate ${formatCurrency(delta)} additional revenue`
            : delta === 0
            ? 'Target equals current revenue'
            : `Target is ${formatCurrency(Math.abs(delta))} below current revenue`}
        </div>
      )}

      <Button
        onClick={onNext}
        disabled={targetRevenue <= currentRevenue}
        className="w-full"
      >
        Next: Configure Roles
        <ChevronRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// ─── Step 2: Roles ───────────────────────────────────────────────────────────

function Step2({
  selectedRoles,
  onRolesChange,
  hourBreakdown,
  onBreakdownChange,
  targetRevenue,
  currentRevenue,
  from,
  to,
  onNext,
  onBack,
}: {
  selectedRoles: RoleConfig[];
  onRolesChange: (r: RoleConfig[]) => void;
  hourBreakdown: HourBreakdown[];
  onBreakdownChange: (h: HourBreakdown[]) => void;
  targetRevenue: number;
  currentRevenue: number;
  from: string;
  to: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const { selectedProject } = useAppStore();
  const { data: rolesData } = useRoles();
  const { data: teamsData } = useTeams();
  const { data: billingRatesData } = useBillingRates(selectedProject?.projectId);

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const { data: membersData } = useTeamMembers(selectedTeamId);

  const roles = (rolesData as Role[]) || [];
  const teams = (teamsData as Array<{ id: number; name: string }>) || [];
  const members = (membersData as TeamMember[]) || [];
  const billingRates = billingRatesData as BillingRatesData | undefined;

  const [isCalculating, setIsCalculating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getRateForRole = useCallback((roleId: number): number => {
    const rateEntry = billingRates?.rates?.find((r) => r.roleId === roleId);
    return rateEntry?.rate ?? 0;
  }, [billingRates]);

  const toggleRole = (role: Role) => {
    const exists = selectedRoles.find((r) => r.roleId === role.id);
    if (exists) {
      onRolesChange(selectedRoles.filter((r) => r.roleId !== role.id));
    } else {
      onRolesChange([
        ...selectedRoles,
        {
          roleId: role.id,
          roleName: role.name,
          billingRate: getRateForRole(role.id),
          memberCount: 1,
          accountIds: [],
        },
      ]);
    }
  };

  const updateRole = (roleId: number, updates: Partial<RoleConfig>) => {
    onRolesChange(selectedRoles.map((r) => r.roleId === roleId ? { ...r, ...updates } : r));
  };

  const toggleMember = (roleId: number, accountId: string) => {
    const role = selectedRoles.find((r) => r.roleId === roleId);
    if (!role) return;
    const ids = role.accountIds.includes(accountId)
      ? role.accountIds.filter((id) => id !== accountId)
      : [...role.accountIds, accountId];
    updateRole(roleId, { accountIds: ids, memberCount: ids.length || 1 });
  };

  // Debounced calculate
  useEffect(() => {
    if (selectedRoles.length === 0) {
      onBreakdownChange([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsCalculating(true);
      try {
        const result = await api.post<{ breakdown: HourBreakdown[] }>('/api/budget-delta/calculate', {
          targetRevenue,
          currentRevenue,
          from,
          to,
          roles: selectedRoles,
        });
        onBreakdownChange(result.breakdown || []);
      } catch {
        // ignore calculation errors silently
      } finally {
        setIsCalculating(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedRoles, targetRevenue, currentRevenue, from, to]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Step 2: Configure Roles & Members</h3>
        <p className="text-muted-foreground text-sm mt-1">Select roles and assign members to fill the revenue gap</p>
      </div>

      {/* Team selector for member lookup */}
      {teams.length > 0 && (
        <div className="grid gap-1.5 max-w-xs">
          <Label>Load Members from Team</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedTeamId?.toString() || ''}
            onChange={(e) => setSelectedTeamId(e.target.value ? parseInt(e.target.value) : null)}
          >
            <option value="">Select team...</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Role configuration */}
      <div className="space-y-3">
        <Label>Available Roles</Label>
        {roles.map((role) => {
          const config = selectedRoles.find((r) => r.roleId === role.id);
          const isSelected = !!config;
          return (
            <div key={role.id} className={`border rounded-lg p-4 transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`}>
              <div className="flex items-center gap-3 mb-3">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => toggleRole(role)}
                  id={`role-${role.id}`}
                />
                <label htmlFor={`role-${role.id}`} className="font-medium cursor-pointer">{role.name}</label>
              </div>

              {isSelected && config && (
                <div className="ml-7 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-1">
                      <Label className="text-xs">Billing Rate (EUR/h)</Label>
                      <Input
                        type="number"
                        value={config.billingRate}
                        onChange={(e) => updateRole(role.id, { billingRate: parseFloat(e.target.value) || 0 })}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-xs">Member Count</Label>
                      <Input
                        type="number"
                        min={1}
                        value={config.memberCount}
                        onChange={(e) => updateRole(role.id, { memberCount: parseInt(e.target.value) || 1 })}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>

                  {members.length > 0 && (
                    <div>
                      <Label className="text-xs mb-1 block">Assign Members</Label>
                      <div className="flex flex-wrap gap-2">
                        {members.map((m) => (
                          <button
                            key={m.accountId}
                            type="button"
                            onClick={() => toggleMember(role.id, m.accountId)}
                            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                              config.accountIds.includes(m.accountId)
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background border-input hover:bg-accent'
                            }`}
                          >
                            {m.displayName}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Live preview */}
      {(hourBreakdown.length > 0 || isCalculating) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              Hour Distribution Preview
              {isCalculating && <Loader2 className="h-3 w-3 animate-spin" />}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Hours/Member</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead>Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hourBreakdown.map((row) => (
                  <TableRow key={row.roleId}>
                    <TableCell>{row.roleName}</TableCell>
                    <TableCell>{formatHours(row.hoursPerMember)}</TableCell>
                    <TableCell>{formatHours(row.totalHours)}</TableCell>
                    <TableCell className="font-medium text-green-700">{formatCurrency(row.revenueContribution)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={selectedRoles.length === 0 || isCalculating}
          className="flex-1"
        >
          Next: Assign Issues
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Assignments ──────────────────────────────────────────────────────

function Step3({
  selectedRoles,
  hourBreakdown,
  assignments,
  onAssignmentsChange,
  onNext,
  onBack,
}: {
  selectedRoles: RoleConfig[];
  hourBreakdown: HourBreakdown[];
  assignments: Assignment[];
  onAssignmentsChange: (a: Assignment[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { data: issuesData, isLoading: issuesLoading } = useOpenIssues();
  const [issueSearch, setIssueSearch] = useState('');

  const issues = (issuesData as Issue[]) || [];
  const filteredIssues = issues.filter((i) =>
    !issueSearch ||
    i.key.toLowerCase().includes(issueSearch.toLowerCase()) ||
    i.summary.toLowerCase().includes(issueSearch.toLowerCase())
  );

  // Collect all unique members from selected roles
  const allMembers: Array<{ accountId: string; displayName: string; roleId: number }> = [];
  for (const role of selectedRoles) {
    for (const accountId of role.accountIds) {
      if (!allMembers.find((m) => m.accountId === accountId)) {
        allMembers.push({ accountId, displayName: accountId, roleId: role.roleId });
      }
    }
  }

  const getHoursForMember = (accountId: string): number => {
    const role = selectedRoles.find((r) => r.accountIds.includes(accountId));
    if (!role) return 0;
    const breakdown = hourBreakdown.find((h) => h.roleId === role.roleId);
    return breakdown?.hoursPerMember ?? 0;
  };

  const isAssigned = (accountId: string, issueId: number): boolean =>
    assignments.some((a) => a.accountId === accountId && a.issueId === issueId);

  const getAssignment = (accountId: string, issueId: number): Assignment | undefined =>
    assignments.find((a) => a.accountId === accountId && a.issueId === issueId);

  const toggleAssignment = (member: { accountId: string; displayName: string }, issue: Issue) => {
    const existing = getAssignment(member.accountId, issue.id);
    if (existing) {
      onAssignmentsChange(assignments.filter((a) => !(a.accountId === member.accountId && a.issueId === issue.id)));
    } else {
      onAssignmentsChange([
        ...assignments,
        {
          accountId: member.accountId,
          displayName: member.displayName,
          issueId: issue.id,
          issueKey: issue.key,
          issueName: issue.summary,
          totalHours: getHoursForMember(member.accountId),
        },
      ]);
    }
  };

  const updateHours = (accountId: string, issueId: number, hours: number) => {
    onAssignmentsChange(
      assignments.map((a) =>
        a.accountId === accountId && a.issueId === issueId ? { ...a, totalHours: hours } : a
      )
    );
  };

  if (allMembers.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold">Step 3: Assign Issues</h3>
          <p className="text-muted-foreground text-sm mt-1">No members assigned to roles. Go back and add members.</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Step 3: Assign Issues to Members</h3>
        <p className="text-muted-foreground text-sm mt-1">Check cells to assign issues; edit hours as needed</p>
      </div>

      <div className="grid gap-1.5">
        <Label>Filter Issues</Label>
        <Input
          placeholder="Search by key or summary..."
          value={issueSearch}
          onChange={(e) => setIssueSearch(e.target.value)}
          className="max-w-md"
        />
      </div>

      {issuesLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading open issues...
        </div>
      ) : (
        <div className="overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left px-3 py-2 font-medium sticky left-0 bg-muted z-10 min-w-32">Member</th>
                {filteredIssues.slice(0, 20).map((issue) => (
                  <th key={issue.id} className="text-center px-2 py-2 font-medium min-w-24">
                    <div className="font-mono text-xs">{issue.key}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-20">{issue.summary.substring(0, 30)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allMembers.map((member) => (
                <tr key={member.accountId} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-background z-10">
                    {member.displayName}
                    <div className="text-xs text-muted-foreground">{formatHours(getHoursForMember(member.accountId))}</div>
                  </td>
                  {filteredIssues.slice(0, 20).map((issue) => {
                    const assignment = getAssignment(member.accountId, issue.id);
                    return (
                      <td key={issue.id} className="px-2 py-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <Checkbox
                            checked={!!assignment}
                            onCheckedChange={() => toggleAssignment(member, issue)}
                          />
                          {assignment && (
                            <Input
                              type="number"
                              value={assignment.totalHours}
                              onChange={(e) => updateHours(member.accountId, issue.id, parseFloat(e.target.value) || 0)}
                              className="w-16 h-6 text-xs px-1"
                            />
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={assignments.length === 0}
          className="flex-1"
        >
          Next: Preview Distribution
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Preview ──────────────────────────────────────────────────────────

function Step4({
  assignments,
  selectedRoles,
  from,
  to,
  schedule,
  onScheduleChange,
  onNext,
  onBack,
}: {
  assignments: Assignment[];
  selectedRoles: RoleConfig[];
  from: string;
  to: string;
  schedule: ScheduledEntry[];
  onScheduleChange: (s: ScheduledEntry[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [isDistributing, setIsDistributing] = useState(false);
  const [seed, setSeed] = useState(Date.now());

  const getBillingRate = (accountId: string): number => {
    const role = selectedRoles.find((r) => r.accountIds.includes(accountId));
    return role?.billingRate ?? 0;
  };

  const distribute = useCallback(async (currentSeed: number) => {
    setIsDistributing(true);
    try {
      const result = await api.post<{ schedule: ScheduledEntry[] }>('/api/budget-delta/distribute', {
        assignments,
        from,
        to,
        seed: currentSeed,
      });
      onScheduleChange(result.schedule || []);
    } catch (err: unknown) {
      const error = err as Error;
      console.error('Distribution failed:', error.message);
    } finally {
      setIsDistributing(false);
    }
  }, [assignments, from, to, onScheduleChange]);

  useEffect(() => {
    distribute(seed);
  }, []);

  const handleReroll = () => {
    const newSeed = Date.now();
    setSeed(newSeed);
    distribute(newSeed);
  };

  const totalRevenue = schedule.reduce((sum, entry) => {
    return sum + entry.hours * getBillingRate(entry.accountId);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">Step 4: Preview Distribution</h3>
          <p className="text-muted-foreground text-sm mt-1">Review the worklog schedule before submitting</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReroll} disabled={isDistributing}>
          {isDistributing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Reroll</span>
        </Button>
      </div>

      {/* Revenue summary */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Entries</p>
            <p className="text-2xl font-bold">{schedule.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Projected Revenue</p>
            <p className="text-2xl font-bold text-green-700">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
      </div>

      {isDistributing ? (
        <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Distributing worklogs...
        </div>
      ) : (
        <div className="border rounded-lg overflow-auto max-h-96">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Hours</TableHead>
                <TableHead>Revenue</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.map((entry, idx) => (
                <TableRow key={idx} className={entry.overflow ? 'bg-yellow-50' : ''}>
                  <TableCell className="whitespace-nowrap">{formatDate(entry.startDate)}</TableCell>
                  <TableCell>{entry.displayName || entry.accountId}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs bg-secondary px-1 rounded">{entry.issueKey}</span>
                    <span className="text-xs text-muted-foreground ml-2">{entry.issueName?.substring(0, 30)}</span>
                  </TableCell>
                  <TableCell>{formatHours(entry.hours)}</TableCell>
                  <TableCell className="font-medium">{formatCurrency(entry.hours * getBillingRate(entry.accountId))}</TableCell>
                  <TableCell>
                    {entry.overflow && (
                      <Badge variant="warning" className="flex items-center gap-1 w-fit">
                        <AlertTriangle className="h-3 w-3" />
                        overflow
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={schedule.length === 0 || isDistributing}
          className="flex-1"
        >
          Next: Submit Worklogs
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 5: Submit ───────────────────────────────────────────────────────────

function Step5({
  schedule,
  onBack,
}: {
  schedule: ScheduledEntry[];
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [results, setResults] = useState<SubmitResult[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(0);

  const successCount = results.filter((r) => r.status === 'success').length;
  const errorCount = results.filter((r) => r.status === 'error').length;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setResults([]);
    setSubmitted(0);

    for (let i = 0; i < schedule.length; i++) {
      const entry = schedule[i];
      try {
        await api.post('/api/budget-delta/submit-worklog', {
          accountId: entry.accountId,
          issueId: entry.issueId,
          startDate: entry.startDate,
          hours: entry.hours,
        });
        setResults((prev) => [
          ...prev,
          {
            accountId: entry.accountId,
            displayName: entry.displayName || entry.accountId,
            issueId: entry.issueId,
            issueKey: entry.issueKey,
            startDate: entry.startDate,
            hours: entry.hours,
            status: 'success',
          },
        ]);
      } catch (err: unknown) {
        const error = err as Error;
        setResults((prev) => [
          ...prev,
          {
            accountId: entry.accountId,
            displayName: entry.displayName || entry.accountId,
            issueId: entry.issueId,
            issueKey: entry.issueKey,
            startDate: entry.startDate,
            hours: entry.hours,
            status: 'error',
            error: error.message,
          },
        ]);
      }
      setSubmitted(i + 1);
    }

    setIsSubmitting(false);
    toast({
      title: 'Submission complete',
      description: `${successCount} created, ${errorCount} errors`,
    });
  };

  const progress = schedule.length > 0 ? (submitted / schedule.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Step 5: Submit Worklogs</h3>
        <p className="text-muted-foreground text-sm mt-1">
          {schedule.length} worklogs ready to submit to Tempo
        </p>
      </div>

      {isSubmitting && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Submitting...</span>
            <span>{submitted} / {schedule.length}</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
              <CheckCircle className="h-4 w-4" />
              {successCount} created
            </div>
            {errorCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                <XCircle className="h-4 w-4" />
                {errorCount} errors
              </div>
            )}
          </div>

          <div className="border rounded-lg overflow-auto max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((result, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{result.displayName}</TableCell>
                    <TableCell>
                      <span className="font-mono text-xs bg-secondary px-1 rounded">{result.issueKey}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(result.startDate)}</TableCell>
                    <TableCell>{formatHours(result.hours)}</TableCell>
                    <TableCell>
                      {result.status === 'success' ? (
                        <div className="flex items-center gap-1 text-green-700">
                          <CheckCircle className="h-4 w-4" />
                          <span className="text-xs">Created</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-destructive" title={result.error}>
                          <XCircle className="h-4 w-4" />
                          <span className="text-xs truncate max-w-32">{result.error}</span>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} disabled={isSubmitting}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={isSubmitting || (results.length > 0 && !errorCount)}
          className="flex-1"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Submitting {submitted}/{schedule.length}...
            </>
          ) : results.length > 0 && errorCount === 0 ? (
            'All Submitted!'
          ) : (
            'Submit Worklogs'
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Main BudgetDeltaPage ─────────────────────────────────────────────────────

export function BudgetDeltaPage() {
  const { activePeriod } = useAppStore();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Step 1
  const [from, setFrom] = useState(activePeriod.from);
  const [to, setTo] = useState(activePeriod.to);
  const [targetRevenue, setTargetRevenue] = useState(0);

  // Step 2
  const [selectedRoles, setSelectedRoles] = useState<RoleConfig[]>([]);
  const [hourBreakdown, setHourBreakdown] = useState<HourBreakdown[]>([]);

  // Step 3
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  // Step 4
  const [schedule, setSchedule] = useState<ScheduledEntry[]>([]);

  const { data: revenueData } = useRevenue();
  const currentRevenue = (revenueData as { totalRevenue: number } | undefined)?.totalRevenue ?? 0;

  const stepLabels = ['Target', 'Roles', 'Assign', 'Preview', 'Submit'];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Budget Delta</h2>
        <p className="text-muted-foreground mt-1">Generate worklogs to reach your target revenue</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Step labels */}
          <div className="flex justify-between mb-2 text-xs text-muted-foreground px-4">
            {stepLabels.map((label, i) => (
              <span key={i} className={i + 1 === step ? 'text-primary font-medium' : ''}>{label}</span>
            ))}
          </div>
          <StepIndicator step={step} total={5} />

          {step === 1 && (
            <Step1
              from={from}
              to={to}
              targetRevenue={targetRevenue}
              onFromChange={setFrom}
              onToChange={setTo}
              onTargetChange={setTargetRevenue}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2
              selectedRoles={selectedRoles}
              onRolesChange={setSelectedRoles}
              hourBreakdown={hourBreakdown}
              onBreakdownChange={setHourBreakdown}
              targetRevenue={targetRevenue}
              currentRevenue={currentRevenue}
              from={from}
              to={to}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && (
            <Step3
              selectedRoles={selectedRoles}
              hourBreakdown={hourBreakdown}
              assignments={assignments}
              onAssignmentsChange={setAssignments}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && (
            <Step4
              assignments={assignments}
              selectedRoles={selectedRoles}
              from={from}
              to={to}
              schedule={schedule}
              onScheduleChange={setSchedule}
              onNext={() => setStep(5)}
              onBack={() => setStep(3)}
            />
          )}

          {step === 5 && (
            <Step5
              schedule={schedule}
              onBack={() => setStep(4)}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
