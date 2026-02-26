import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  useTeams, useTeamMembers, useRoles, useBillingRates,
  useSaveBillingRateOverride, useUpdateTeamMembership,
} from '@/hooks/useTeam';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface TempoTeam {
  id: number;
  name: string;
}

interface TeamMember {
  accountId: string;
  displayName: string;
  roleId?: number;
  roleName?: string;
  membershipId?: number;
}

interface Role {
  id: number;
  name: string;
}

interface BillingRate {
  accountId?: string;
  roleId?: number;
  rate: number;
  source: 'override' | 'global' | 'none';
}

interface BillingRatesData {
  rates: BillingRate[];
}

function RateSourceBadge({ source }: { source: string }) {
  if (source === 'override') return <Badge className="text-xs bg-blue-100 text-blue-800 border-0">override</Badge>;
  if (source === 'global') return <Badge variant="secondary" className="text-xs">global</Badge>;
  return <Badge variant="destructive" className="text-xs">none</Badge>;
}

function MemberRow({
  member,
  roles,
  billingRates,
  projectId,
  teamId,
}: {
  member: TeamMember;
  roles: Role[];
  billingRates: BillingRatesData | undefined;
  projectId: string | undefined;
  teamId: number;
}) {
  const { toast } = useToast();
  const saveOverride = useSaveBillingRateOverride();
  const updateMembership = useUpdateTeamMembership();

  const rateEntry = billingRates?.rates?.find((r) => r.accountId === member.accountId);
  const [overrideRate, setOverrideRate] = useState<string>(
    rateEntry?.source === 'override' && rateEntry.rate != null ? rateEntry.rate.toString() : ''
  );

  const handleRoleChange = async (roleId: string) => {
    try {
      await updateMembership.mutateAsync({
        teamId,
        accountId: member.accountId,
        membershipId: member.membershipId,
        roleId: parseInt(roleId),
      });
      toast({ title: 'Role updated' });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to update role', description: error.message, variant: 'destructive' });
    }
  };

  const handleSaveOverride = async () => {
    const rate = parseFloat(overrideRate);
    if (isNaN(rate)) {
      toast({ title: 'Invalid rate', description: 'Enter a valid number', variant: 'destructive' });
      return;
    }
    try {
      await saveOverride.mutateAsync({
        accountId: member.accountId,
        projectId: projectId ?? '',
        rate,
      });
      toast({ title: 'Billing rate override saved' });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to save rate', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{member.displayName}</TableCell>
      <TableCell>
        <Select
          defaultValue={member.roleId?.toString()}
          onValueChange={handleRoleChange}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Select role..." />
          </SelectTrigger>
          <SelectContent>
            {roles.map((role) => (
              <SelectItem key={role.id} value={role.id.toString()}>
                {role.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {rateEntry ? formatCurrency(rateEntry.rate) : '—'}
          </span>
          {rateEntry && <RateSourceBadge source={rateEntry.source} />}
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Override rate..."
            value={overrideRate}
            onChange={(e) => setOverrideRate(e.target.value)}
            className="w-32"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveOverride}
            disabled={saveOverride.isPending || !overrideRate}
          >
            {saveOverride.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function TeamPage() {
  const { selectedProject, activeTeamId, setActiveTeamId } = useAppStore();
  const [roleFilter, setRoleFilter] = useState('');

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const { data: membersData, isLoading: membersLoading } = useTeamMembers(activeTeamId);
  const { data: rolesData } = useRoles();
  const { data: billingRatesData } = useBillingRates(selectedProject?.projectId);

  const teams = (teamsData as TempoTeam[]) || [];
  const members = (membersData as TeamMember[]) || [];
  const roles = (rolesData as Role[]) || [];
  const billingRates = billingRatesData as BillingRatesData | undefined;

  const filteredMembers = members.filter(
    (m) => !roleFilter || (m.roleName ?? '').toLowerCase().includes(roleFilter.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Team Management</h2>
        <p className="text-muted-foreground mt-1">Manage team members, roles and billing rates</p>
      </div>

      {/* Team Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-1.5 max-w-xs">
            <Label>Select Team</Label>
            {teamsLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading teams...
              </div>
            ) : (
              <Combobox
                options={teams.map((t) => ({ value: t.id.toString(), label: t.name }))}
                value={activeTeamId?.toString() ?? ''}
                onChange={(v) => setActiveTeamId(v ? parseInt(v) : null)}
                placeholder="Choose a team..."
                searchPlaceholder="Search teams..."
              />
            )}
          </div>

          {members.length > 0 && (
            <div className="max-w-xs">
              <Input
                placeholder="Filter by role..."
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
              />
            </div>
          )}

          {activeTeamId !== null && (
            <>
              {membersLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading members...
                </div>
              ) : filteredMembers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {members.length === 0 ? 'No members in this team' : 'No members match the role filter'}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Member</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Current Rate</TableHead>
                      <TableHead>Override Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMembers.map((member) => (
                      <MemberRow
                        key={member.accountId}
                        member={member}
                        roles={roles}
                        billingRates={billingRates}
                        projectId={selectedProject?.projectId}
                        teamId={activeTeamId}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
