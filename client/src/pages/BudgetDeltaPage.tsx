import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { eachDayOfInterval, parseISO, getDay, format } from 'date-fns';
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
import { Combobox } from '@/components/ui/combobox';
import { useRevenue } from '@/hooks/useWorklogs';
import { useBillingRates, useTeams, useTeamMembers } from '@/hooks/useTeam';
import { useOpenIssues } from '@/hooks/useIssues';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/api/apiClient';
import { formatCurrency, formatHours, formatDate } from '@/lib/utils';
import {
  ChevronRight, ChevronLeft, ChevronDown, ChevronUp,
  Loader2, RefreshCw, CheckCircle, XCircle,
} from 'lucide-react';

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

interface IssueConfig {
  issueId: number;
  issueKey: string;
  issueName: string;
  roleIds: number[];
  complexity: number;
}

interface ScheduledEntry {
  accountId: string;
  displayName: string;
  issueId: number;
  issueKey: string;
  issueName: string;
  roleId?: number;
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

interface BillingRatesData {
  rates?: Array<{ roleId?: number; accountId?: string; rate: number; source: string }>;
}

interface TeamMember {
  accountId: string;
  displayName: string;
  roleId?: number | null;
  roleName?: string | null;
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

// ─── Step 2: Roles (team-derived) ────────────────────────────────────────────

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
  onMemberNamesChange,
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
  onMemberNamesChange: (names: Record<string, string>) => void;
}) {
  const { selectedProject } = useAppStore();
  const { data: teamsData } = useTeams();
  const { data: billingRatesData } = useBillingRates(selectedProject?.projectId);

  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const { data: membersData } = useTeamMembers(selectedTeamId);

  const teams = (teamsData as Array<{ id: number; name: string }>) || [];
  const members = (membersData as TeamMember[]) || [];
  const billingRates = billingRatesData as BillingRatesData | undefined;

  const [isCalculating, setIsCalculating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive unique roles from the loaded team members
  const teamRoles = useMemo(
    () =>
      [...new Map(
        members
          .filter(m => m.roleId != null)
          .map(m => [m.roleId, { id: m.roleId!, name: m.roleName ?? '' }])
      ).values()].filter(r => r.name !== ''),
    [members]
  );

  // Build and pass up member names map when members load
  useEffect(() => {
    if (members.length > 0) {
      const names = Object.fromEntries(members.map(m => [m.accountId, m.displayName]));
      onMemberNamesChange(names);
    }
  }, [members]);

  // Reset selected roles when switching teams
  useEffect(() => {
    onRolesChange([]);
  }, [selectedTeamId]);

  const getRateForRole = useCallback((roleId: number): number => {
    const rateEntry = billingRates?.rates?.find((r) => r.roleId === roleId);
    return rateEntry?.rate ?? 0;
  }, [billingRates]);

  const toggleRole = (role: { id: number; name: string }) => {
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

  // Debounced hour calculation
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
        <p className="text-muted-foreground text-sm mt-1">Select a team, then pick roles and assign members</p>
      </div>

      {/* Team selector (Combobox) */}
      <div className="grid gap-1.5 max-w-xs">
        <Label>Team</Label>
        <Combobox
          options={teams.map(t => ({ value: t.id.toString(), label: t.name }))}
          value={selectedTeamId?.toString() ?? ''}
          onChange={v => setSelectedTeamId(v ? parseInt(v) : null)}
          placeholder="Select team..."
          searchPlaceholder="Search teams..."
        />
      </div>

      {/* Role cards — only show team-derived roles */}
      {selectedTeamId !== null && (
        <div className="space-y-3">
          <Label>
            Team Roles
            {teamRoles.length === 0 && members.length === 0 && (
              <span className="text-muted-foreground font-normal ml-2">
                (loading members...)
              </span>
            )}
          </Label>
          {teamRoles.length === 0 && members.length > 0 && (
            <p className="text-sm text-muted-foreground">No roles found in this team.</p>
          )}
          {teamRoles.map((role) => {
            const config = selectedRoles.find((r) => r.roleId === role.id);
            const isSelected = !!config;
            // Only show members whose active role matches this role
            const roleMembers = members.filter(m => m.roleId === role.id);

            return (
              <div key={role.id} className={`border rounded-lg p-4 transition-colors ${isSelected ? 'border-primary bg-primary/5' : ''}`}>
                <div className="flex items-center gap-3 mb-3">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleRole(role)}
                    id={`role-${role.id}`}
                  />
                  <label htmlFor={`role-${role.id}`} className="font-medium cursor-pointer">
                    {role.name}
                  </label>
                  <span className="text-xs text-muted-foreground">({roleMembers.length} members)</span>
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
                    </div>

                    {roleMembers.length > 0 && (
                      <div>
                        <Label className="text-xs mb-1 block">Assign Members</Label>
                        <div className="flex flex-wrap gap-2">
                          {roleMembers.map((m) => (
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
      )}

      {/* Live hour breakdown preview */}
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
          Next: Assign Roles to Issues
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 3: Issue-centric role assignment ───────────────────────────────────

function Step3({
  selectedRoles,
  issueConfigs,
  onIssueConfigsChange,
  onNext,
  onBack,
}: {
  selectedRoles: RoleConfig[];
  issueConfigs: IssueConfig[];
  onIssueConfigsChange: (c: IssueConfig[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const { data: issuesData, isLoading: issuesLoading } = useOpenIssues();
  const issues = (issuesData as Issue[]) || [];

  const [roleSearch, setRoleSearch] = useState<Record<number, string>>({});
  const [dropdownOpen, setDropdownOpen] = useState<Record<number, boolean>>({});

  // Initialize issueConfigs when issues first load
  useEffect(() => {
    if (issues.length > 0 && issueConfigs.length === 0) {
      onIssueConfigsChange(
        issues.map(issue => ({
          issueId: issue.id,
          issueKey: issue.key,
          issueName: issue.summary,
          roleIds: [],
          complexity: 5,
        }))
      );
    }
  }, [issues]);

  const getFilteredRoles = (issueId: number) => {
    const search = (roleSearch[issueId] ?? '').toLowerCase();
    const config = issueConfigs.find(ic => ic.issueId === issueId);
    return selectedRoles.filter(r =>
      r.roleName.toLowerCase().includes(search) &&
      !(config?.roleIds.includes(r.roleId) ?? false)
    );
  };

  const addRoleToIssue = (issueId: number, roleId: number) => {
    onIssueConfigsChange(
      issueConfigs.map(ic =>
        ic.issueId === issueId
          ? { ...ic, roleIds: [...ic.roleIds, roleId] }
          : ic
      )
    );
    setRoleSearch(prev => ({ ...prev, [issueId]: '' }));
    setDropdownOpen(prev => ({ ...prev, [issueId]: false }));
  };

  const removeRoleFromIssue = (issueId: number, roleId: number) => {
    onIssueConfigsChange(
      issueConfigs.map(ic =>
        ic.issueId === issueId
          ? { ...ic, roleIds: ic.roleIds.filter(id => id !== roleId) }
          : ic
      )
    );
  };

  const setComplexity = (issueId: number, complexity: number) => {
    onIssueConfigsChange(
      issueConfigs.map(ic =>
        ic.issueId === issueId ? { ...ic, complexity } : ic
      )
    );
  };

  const hasAnyAssignment = issueConfigs.some(ic => ic.roleIds.length > 0);

  if (issuesLoading) {
    return (
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">Step 3: Assign Roles to Issues</h3>
        <div className="flex items-center gap-2 text-muted-foreground py-8">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading open issues...
        </div>
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold">Step 3: Assign Roles to Issues</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Assign roles to each issue and set complexity weight (1–10). Issues with no roles are skipped.
        </p>
      </div>

      {issueConfigs.length === 0 && (
        <div className="rounded-md border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No open issues found for this project.
          <br />
          <span className="text-xs">Check that the Jira project key is configured correctly in Settings.</span>
        </div>
      )}

      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {issueConfigs.map(ic => {
          const hasRoles = ic.roleIds.length > 0;
          const filtered = getFilteredRoles(ic.issueId);
          return (
            <div
              key={ic.issueId}
              className={`border rounded-lg p-4 transition-colors ${hasRoles ? 'border-primary/50 bg-primary/5' : 'opacity-60'}`}
            >
              {/* Issue header */}
              <div className="flex items-start gap-2 mb-3">
                <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded shrink-0 mt-0.5">
                  {ic.issueKey}
                </span>
                <span className="text-sm font-medium line-clamp-2">{ic.issueName}</span>
              </div>

              <div className="grid grid-cols-[1fr_160px] gap-4 items-start">
                {/* Role autocomplete */}
                <div>
                  <Label className="text-xs mb-1 block">Roles</Label>
                  {ic.roleIds.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2">
                      {ic.roleIds.map(roleId => {
                        const rc = selectedRoles.find(r => r.roleId === roleId);
                        return rc ? (
                          <span
                            key={roleId}
                            className="flex items-center gap-1 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full"
                          >
                            {rc.roleName}
                            <button
                              type="button"
                              onClick={() => removeRoleFromIssue(ic.issueId, roleId)}
                              className="ml-0.5 opacity-70 hover:opacity-100 leading-none"
                            >
                              ×
                            </button>
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                  <div className="relative">
                    <Input
                      value={roleSearch[ic.issueId] ?? ''}
                      onChange={e => {
                        setRoleSearch(prev => ({ ...prev, [ic.issueId]: e.target.value }));
                        setDropdownOpen(prev => ({ ...prev, [ic.issueId]: true }));
                      }}
                      onFocus={() => setDropdownOpen(prev => ({ ...prev, [ic.issueId]: true }))}
                      onBlur={() =>
                        setTimeout(
                          () => setDropdownOpen(prev => ({ ...prev, [ic.issueId]: false })),
                          150
                        )
                      }
                      onKeyDown={e => {
                        if (e.key === 'Enter' && filtered.length > 0) {
                          addRoleToIssue(ic.issueId, filtered[0].roleId);
                        }
                      }}
                      placeholder={selectedRoles.length === 0 ? 'No roles — go back to Step 2' : 'Add role...'}
                      className="h-8 text-sm"
                      disabled={selectedRoles.length === 0}
                    />
                    {dropdownOpen[ic.issueId] && filtered.length > 0 && (
                      <div className="absolute top-full left-0 right-0 z-20 border bg-background shadow-md rounded-md mt-1 max-h-40 overflow-auto">
                        {filtered.map(role => (
                          <button
                            key={role.roleId}
                            type="button"
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                            onMouseDown={e => {
                              e.preventDefault();
                              addRoleToIssue(ic.issueId, role.roleId);
                            }}
                          >
                            {role.roleName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Complexity slider */}
                <div>
                  <Label className="text-xs mb-1 block">
                    Complexity: <span className="font-bold">{ic.complexity}</span>
                  </Label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    step={1}
                    value={ic.complexity}
                    onChange={e => setComplexity(ic.issueId, parseInt(e.target.value))}
                    className="w-full accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-0.5">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!hasAnyAssignment}
          className="flex-1"
        >
          Next: Preview Distribution
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 4: Preview (revenue summary + issue table + calendar) ───────────────

function Step4({
  issueConfigs,
  selectedRoles,
  hourBreakdown,
  memberNames,
  from,
  to,
  schedule,
  onScheduleChange,
  currentRevenue,
  targetRevenue,
  onNext,
  onBack,
}: {
  issueConfigs: IssueConfig[];
  selectedRoles: RoleConfig[];
  hourBreakdown: HourBreakdown[];
  memberNames: Record<string, string>;
  from: string;
  to: string;
  schedule: ScheduledEntry[];
  onScheduleChange: (s: ScheduledEntry[]) => void;
  currentRevenue: number;
  targetRevenue: number;
  onNext: () => void;
  onBack: () => void;
}) {
  const [isDistributing, setIsDistributing] = useState(false);
  const [seed, setSeed] = useState(Date.now());
  const [expandedIssueId, setExpandedIssueId] = useState<number | null>(null);

  const getBillingRate = (roleId: number): number => {
    const role = selectedRoles.find(r => r.roleId === roleId);
    return role?.billingRate ?? 0;
  };

  const distribute = useCallback(async (currentSeed: number) => {
    setIsDistributing(true);
    try {
      const result = await api.post<{ schedule: ScheduledEntry[] }>('/api/budget-delta/distribute', {
        issueConfigs: issueConfigs.filter(ic => ic.roleIds.length > 0),
        roleConfigs: selectedRoles,
        hourBreakdown: hourBreakdown.map(h => ({
          roleId: h.roleId,
          hoursPerMember: h.hoursPerMember,
          totalHours: h.totalHours,
        })),
        memberNames,
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
  }, [issueConfigs, selectedRoles, hourBreakdown, memberNames, from, to, onScheduleChange]);

  useEffect(() => {
    distribute(seed);
  }, []);

  const handleReroll = () => {
    const newSeed = Date.now();
    setSeed(newSeed);
    distribute(newSeed);
  };

  // Working days for calendar
  const workingDays = useMemo(() => {
    if (!from || !to) return [];
    try {
      return eachDayOfInterval({ start: parseISO(from), end: parseISO(to) })
        .filter(d => getDay(d) !== 0 && getDay(d) !== 6)
        .map(d => format(d, 'yyyy-MM-dd'));
    } catch {
      return [];
    }
  }, [from, to]);

  // Revenue stats
  const deltaToAchieve = targetRevenue - currentRevenue;
  const deltaAchieved = schedule.reduce(
    (sum, entry) => sum + entry.hours * getBillingRate(entry.roleId ?? 0),
    0
  );

  // Issues with roles assigned
  const activeIssues = issueConfigs.filter(ic => ic.roleIds.length > 0);

  const getIssueHours = (issueId: number) =>
    schedule.filter(e => e.issueId === issueId).reduce((s, e) => s + e.hours, 0);

  const getIssueRevenue = (issueId: number) =>
    schedule.filter(e => e.issueId === issueId).reduce(
      (s, e) => s + e.hours * getBillingRate(e.roleId ?? 0),
      0
    );

  const getAssignedMembers = (ic: IssueConfig) =>
    ic.roleIds.flatMap(roleId => {
      const rc = selectedRoles.find(r => r.roleId === roleId);
      return (rc?.accountIds ?? []).map(accountId => ({
        accountId,
        displayName: memberNames[accountId] ?? accountId,
        roleId,
      }));
    });

  // Footer role totals (only roles that contributed hours)
  const roleTotals = selectedRoles
    .map(role => {
      const entries = schedule.filter(e => e.roleId === role.roleId);
      const hours = entries.reduce((s, e) => s + e.hours, 0);
      return { ...role, hours, revenue: hours * role.billingRate };
    })
    .filter(r => r.hours > 0);

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

      {/* Revenue summary — 4 stat cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Current Revenue</p>
            <p className="text-xl font-bold">{formatCurrency(currentRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Target Revenue</p>
            <p className="text-xl font-bold">{formatCurrency(targetRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Delta to Achieve</p>
            <p className="text-xl font-bold text-blue-700">{formatCurrency(deltaToAchieve)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Delta Achieved</p>
            <p className={`text-xl font-bold ${deltaAchieved >= deltaToAchieve * 0.95 ? 'text-green-700' : 'text-amber-600'}`}>
              {formatCurrency(deltaAchieved)}
            </p>
          </CardContent>
        </Card>
      </div>

      {isDistributing ? (
        <div className="flex items-center justify-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Distributing worklogs...
        </div>
      ) : (
        <>
          {/* Issue breakdown table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Issue</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="text-center w-24">Complexity</TableHead>
                  <TableHead className="text-right w-24">Hours</TableHead>
                  <TableHead className="text-right w-28">Revenue</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeIssues.map(ic => (
                  <React.Fragment key={ic.issueId}>
                    <TableRow>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs bg-secondary px-1.5 py-0.5 rounded shrink-0">
                            {ic.issueKey}
                          </span>
                          <span className="text-xs text-muted-foreground truncate max-w-48">
                            {ic.issueName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {ic.roleIds.map(roleId => {
                            const rc = selectedRoles.find(r => r.roleId === roleId);
                            return rc ? (
                              <Badge key={roleId} variant="secondary" className="text-xs">
                                {rc.roleName}
                              </Badge>
                            ) : null;
                          })}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{ic.complexity}</TableCell>
                      <TableCell className="text-right">{formatHours(getIssueHours(ic.issueId))}</TableCell>
                      <TableCell className="text-right font-medium text-green-700">
                        {formatCurrency(getIssueRevenue(ic.issueId))}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() =>
                            setExpandedIssueId(expandedIssueId === ic.issueId ? null : ic.issueId)
                          }
                        >
                          {expandedIssueId === ic.issueId
                            ? <ChevronUp className="h-4 w-4" />
                            : <ChevronDown className="h-4 w-4" />}
                        </Button>
                      </TableCell>
                    </TableRow>

                    {/* Calendar expand */}
                    {expandedIssueId === ic.issueId && (
                      <TableRow>
                        <TableCell colSpan={6} className="p-0 bg-muted/20">
                          <div className="overflow-x-auto border-t">
                            <table className="w-full text-xs whitespace-nowrap">
                              <thead>
                                <tr className="border-b bg-muted/30">
                                  <th className="sticky left-0 bg-muted/30 text-left px-3 py-1.5 min-w-40 font-medium">
                                    Member / Role
                                  </th>
                                  {workingDays.map(day => (
                                    <th key={day} className="text-center px-2 py-1.5 min-w-14 font-medium">
                                      {format(parseISO(day), 'EEE dd')}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {getAssignedMembers(ic).map((member, mi) => (
                                  <tr key={`${member.accountId}-${mi}`} className="border-t hover:bg-muted/10">
                                    <td className="sticky left-0 bg-muted/20 px-3 py-1.5">
                                      <div className="font-medium">{member.displayName}</div>
                                      <div className="text-muted-foreground">
                                        {selectedRoles.find(r => r.roleId === member.roleId)?.roleName}
                                      </div>
                                    </td>
                                    {workingDays.map(day => {
                                      const entry = schedule.find(
                                        e =>
                                          e.issueId === ic.issueId &&
                                          e.accountId === member.accountId &&
                                          e.startDate === day
                                      );
                                      return (
                                        <td
                                          key={day}
                                          className={`text-center px-2 py-1.5 ${entry?.overflow ? 'bg-yellow-100' : ''}`}
                                        >
                                          {entry ? entry.hours : '–'}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Footer role totals */}
          {roleTotals.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Role Totals</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Total Hours</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roleTotals.map(r => (
                      <TableRow key={r.roleId}>
                        <TableCell>{r.roleName}</TableCell>
                        <TableCell className="text-right">{formatHours(r.hours)}</TableCell>
                        <TableCell className="text-right font-medium text-green-700">
                          {formatCurrency(r.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold border-t-2">
                      <TableCell>Grand Total</TableCell>
                      <TableCell className="text-right">
                        {formatHours(roleTotals.reduce((s, r) => s + r.hours, 0))}
                      </TableCell>
                      <TableCell className="text-right text-green-700">
                        {formatCurrency(deltaAchieved)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
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
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});

  // Step 3
  const [issueConfigs, setIssueConfigs] = useState<IssueConfig[]>([]);

  // Step 4
  const [schedule, setSchedule] = useState<ScheduledEntry[]>([]);

  const { data: revenueData } = useRevenue();
  const currentRevenue = (revenueData as { totalRevenue: number } | undefined)?.totalRevenue ?? 0;

  const stepLabels = ['Target', 'Roles', 'Issues', 'Preview', 'Submit'];

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
              onMemberNamesChange={setMemberNames}
            />
          )}

          {step === 3 && (
            <Step3
              selectedRoles={selectedRoles}
              issueConfigs={issueConfigs}
              onIssueConfigsChange={setIssueConfigs}
              onNext={() => setStep(4)}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && (
            <Step4
              issueConfigs={issueConfigs}
              selectedRoles={selectedRoles}
              hourBreakdown={hourBreakdown}
              memberNames={memberNames}
              from={from}
              to={to}
              schedule={schedule}
              onScheduleChange={setSchedule}
              currentRevenue={currentRevenue}
              targetRevenue={targetRevenue}
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
