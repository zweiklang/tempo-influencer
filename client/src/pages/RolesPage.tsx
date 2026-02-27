import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRoles, useCreateRole, useSaveRoleDescriptions } from '@/hooks/useTeam';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Plus } from 'lucide-react';

function getDefaultDescription(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('account manager')) return 'Manages client relationships and briefs. Coordinates communication between client and agency teams throughout projects.';
  if (lower.includes('creative director')) return 'Sets visual creative direction. Reviews design outputs and ensures brand and aesthetic coherence across deliverables.';
  if (lower.includes('service designer')) return 'Designs end-to-end service experiences. Conducts user research and creates service blueprints and journey maps.';
  if (lower.includes('ux designer') || lower.includes('ux design')) return 'Creates user-centered interfaces, wireframes and prototypes. Focuses on usability and user flow across digital products.';
  if (lower.includes('ui designer') || lower.includes('ui design')) return 'Crafts pixel-perfect visual designs and components. Maintains design systems and ensures brand consistency.';
  if (lower.includes('designer') || lower.includes('design')) return 'Creates visual designs and prototypes. Ensures a high-quality, consistent user experience across all deliverables.';
  if (lower.includes('developer') || lower.includes('engineer') || lower.includes('dev')) return 'Implements features and fixes bugs. Reviews code and contributes to technical architecture decisions.';
  if (lower.includes('data') || lower.includes('analyst')) return 'Analyzes data and builds reports. Provides insights to support data-driven decisions and performance tracking.';
  if (lower.includes('strategist') || lower.includes('strategy')) return 'Develops digital strategy and positioning. Defines roadmaps based on research and aligns goals with execution.';
  if (lower.includes('copywriter') || lower.includes('content') || lower.includes('writer')) return 'Writes compelling copy and content. Develops editorial guidelines and ensures consistent brand voice.';
  if (lower.includes('qa') || lower.includes('tester') || lower.includes('test')) return 'Tests features for quality assurance. Writes test cases, reports bugs and ensures software meets release standards.';
  if (lower === 'pm' || lower.includes('project manager') || lower.includes('project management')) return 'Manages project scope, timelines, budgets and stakeholder communication. Bridges client needs with team execution.';
  return '';
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

interface Role {
  id: number;
  name: string;
  description?: string;
}

export function RolesPage() {
  const { toast } = useToast();
  const { data: rolesData } = useRoles();
  const roles = (rolesData as Role[]) || [];
  const saveDescriptions = useSaveRoleDescriptions();

  const [descriptions, setDescriptions] = useState<Record<number, string>>({});

  // Initialize descriptions from loaded roles (use stored value or generate default)
  useEffect(() => {
    if (roles.length === 0) return;
    setDescriptions((prev) => {
      const next = { ...prev };
      for (const role of roles) {
        if (!(role.id in next)) {
          next[role.id] = role.description && role.description.trim() !== ''
            ? role.description
            : getDefaultDescription(role.name);
        }
      }
      return next;
    });
  }, [roles]);

  const handleSave = async () => {
    try {
      await saveDescriptions.mutateAsync(descriptions);
      toast({ title: 'Descriptions saved' });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
    }
  };

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
          {roles.length === 0 && (
            <p className="text-sm text-muted-foreground">No roles defined yet</p>
          )}
          {roles.map((role) => {
            const desc = descriptions[role.id] ?? '';
            return (
              <div key={role.id} className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{role.name}</span>
                  <span className="text-xs text-muted-foreground">ID {role.id}</span>
                </div>
                <div className="relative">
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                    rows={2}
                    maxLength={300}
                    placeholder="Describe what this role does on a typical project…"
                    value={desc}
                    onChange={(e) =>
                      setDescriptions((prev) => ({ ...prev, [role.id]: e.target.value }))
                    }
                  />
                  <span className="absolute bottom-1.5 right-2 text-xs text-muted-foreground">
                    {desc.length}/300
                  </span>
                </div>
              </div>
            );
          })}
          {roles.length > 0 && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saveDescriptions.isPending}
            >
              {saveDescriptions.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving…</>
              ) : (
                'Save Descriptions'
              )}
            </Button>
          )}
          <AddRoleForm />
        </CardContent>
      </Card>
    </div>
  );
}
