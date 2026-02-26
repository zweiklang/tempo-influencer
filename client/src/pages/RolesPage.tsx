import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useRoles, useCreateRole } from '@/hooks/useTeam';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus } from 'lucide-react';

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

interface Role {
  id: number;
  name: string;
}

export function RolesPage() {
  const { data: rolesData } = useRoles();
  const roles = (rolesData as Role[]) || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Role Management</h2>
        <p className="text-muted-foreground mt-1">Create and manage team roles</p>
      </div>

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
    </div>
  );
}
