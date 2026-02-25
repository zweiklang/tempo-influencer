import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  useTeams, useTeamMembers, useRoles, useBillingRates,
  useSaveBillingRateOverride, useCreateRole, useUpdateTeamMembership,
} from '@/hooks/useTeam';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';
import { Loader2, Plus } from 'lucide-react';

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
        projectId,
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

function AddRoleForm() {
  const { toast } = useToast();
  const createRole = useCreateRole();
  const [roleName, setRoleName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleName.trim()) return;
    try {
      await createRole.mutateAsync({ name: roleName.trim() });
      toast({ title: 'Role created', description: `"${roleName}" added successfully` });
      setRoleName('');
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to create role', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <div className="grid gap-1.5 flex-1 max-w-xs">
        <Label htmlFor="roleName">New Role Name</Label>
        <Input
          id="roleName"
          placeholder="e.g. Service Designer"
          value={roleName}
          onChange={(e) => setRoleName(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={createRole.isPending || !roleName.trim()} size="sm">
        {createRole.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" />Add Role</>}
      </Button>
    </form>
  );
}

export function TeamPage() {
  const { selectedProject } = useAppStore();
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);

  const { data: teamsData, isLoading: teamsLoading } = useTeams();
  const { data: membersData, isLoading: membersLoading } = useTeamMembers(selectedTeamId);
  const { data: rolesData } = useRoles();
  const { data: billingRatesData } = useBillingRates(selectedProject?.projectId);

  const teams = (teamsData as TempoTeam[]) || [];
  const members = (membersData as TeamMember[]) || [];
  const roles = (rolesData as Role[]) || [];
  const billingRates = billingRatesData as BillingRatesData | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Team Management</h2>
        <p className="text-muted-foreground mt-1">Manage team members, roles and billing rates</p>
      </div>

      {/* Roles Management */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Roles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => (
              <Badge key={role.id} variant="secondary">{role.name}</Badge>
            ))}
            {roles.length === 0 && <p className="text-sm text-muted-foreground">No roles defined yet</p>}
          </div>
          <AddRoleForm />
        </CardContent>
      </Card>

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
              <Select
                value={selectedTeamId?.toString() || ''}
                onValueChange={(v) => setSelectedTeamId(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id.toString()}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedTeamId !== null && (
            <>
              {membersLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading members...
                </div>
              ) : members.length === 0 ? (
                <p className="text-sm text-muted-foreground">No members in this team</p>
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
                    {members.map((member) => (
                      <MemberRow
                        key={member.accountId}
                        member={member}
                        roles={roles}
                        billingRates={billingRates}
                        projectId={selectedProject?.projectId}
                        teamId={selectedTeamId}
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
