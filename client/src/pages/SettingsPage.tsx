import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { useCredentials, useSaveCredentials, useSelectedProject, useSaveProject, useProjectSearch } from '@/hooks/useSettings';
import { useAppStore } from '@/store/appStore';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

// Credentials Form
function CredentialsForm() {
  const { toast } = useToast();
  const { data: credentials, isLoading } = useCredentials();
  const saveCredentials = useSaveCredentials();
  const setCredentialsConfigured = useAppStore((s) => s.setCredentialsConfigured);

  const [form, setForm] = useState({
    jiraUrl: '',
    jiraEmail: '',
    jiraToken: '',
    tempoToken: '',
  });

  const creds = credentials as {
    jiraUrl?: string;
    jiraEmail?: string;
    jiraTokenSavedAt?: string;
    tempoTokenSavedAt?: string;
    configured?: boolean;
  } | undefined;

  const getDaysSince = (dateStr?: string): number | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  const jiraTokenDays = getDaysSince(creds?.jiraTokenSavedAt);
  const tempoTokenDays = getDaysSince(creds?.tempoTokenSavedAt);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveCredentials.mutateAsync(form);
      setCredentialsConfigured(true);
      toast({ title: 'Credentials saved', description: 'Connection tested successfully.' });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to save credentials', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading credentials status...
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {creds?.configured && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
          <CheckCircle className="h-4 w-4" />
          Credentials are configured
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="jiraUrl">Jira URL</Label>
        <Input
          id="jiraUrl"
          placeholder="https://yourcompany.atlassian.net"
          value={form.jiraUrl || creds?.jiraUrl || ''}
          onChange={(e) => setForm((f) => ({ ...f, jiraUrl: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="jiraEmail">Jira Email</Label>
        <Input
          id="jiraEmail"
          type="email"
          placeholder="you@company.com"
          value={form.jiraEmail || creds?.jiraEmail || ''}
          onChange={(e) => setForm((f) => ({ ...f, jiraEmail: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="jiraToken">Jira API Token</Label>
          {jiraTokenDays !== null && jiraTokenDays > 50 && (
            <Badge variant="warning">Token saved {jiraTokenDays} days ago — consider refreshing</Badge>
          )}
          {jiraTokenDays !== null && jiraTokenDays <= 50 && (
            <span className="text-xs text-muted-foreground">Saved {jiraTokenDays} days ago</span>
          )}
        </div>
        <Input
          id="jiraToken"
          type="password"
          placeholder="Leave blank to keep existing token"
          value={form.jiraToken}
          onChange={(e) => setForm((f) => ({ ...f, jiraToken: e.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="tempoToken">Tempo Token</Label>
          {tempoTokenDays !== null && tempoTokenDays > 50 && (
            <Badge variant="warning">Token saved {tempoTokenDays} days ago — consider refreshing</Badge>
          )}
          {tempoTokenDays !== null && tempoTokenDays <= 50 && (
            <span className="text-xs text-muted-foreground">Saved {tempoTokenDays} days ago</span>
          )}
        </div>
        <Input
          id="tempoToken"
          type="password"
          placeholder="Leave blank to keep existing token"
          value={form.tempoToken}
          onChange={(e) => setForm((f) => ({ ...f, tempoToken: e.target.value }))}
        />
      </div>

      <Button type="submit" disabled={saveCredentials.isPending}>
        {saveCredentials.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Testing connection...
          </>
        ) : (
          'Save & Test Connection'
        )}
      </Button>

      {saveCredentials.isError && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4" />
          {(saveCredentials.error as Error)?.message || 'Failed to save credentials'}
        </div>
      )}
    </form>
  );
}

// Project Selector
function ProjectSelector() {
  const { toast } = useToast();
  const { data: selectedProjectData } = useSelectedProject();
  const saveProject = useSaveProject();
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedValue, setSelectedValue] = useState('');

  const sp = selectedProjectData as {
    projectId?: string;
    projectName?: string;
    tempoId?: string;
  } | undefined;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults, isFetching } = useProjectSearch(debouncedQuery);

  const projects = (searchResults as Array<{ key: string; name: string; tempoId?: string }>) || [];
  const options = projects.map((p) => ({ value: p.key, label: `${p.key} — ${p.name}` }));

  const handleSelect = useCallback(async (value: string) => {
    setSelectedValue(value);
    const project = projects.find((p) => p.key === value);
    if (!project) return;
    try {
      await saveProject.mutateAsync({
        projectId: project.key,
        projectName: project.name,
        tempoId: project.tempoId,
      });
      setSelectedProject({
        projectId: project.key,
        projectName: project.name,
        tempoId: project.tempoId,
      });
      toast({ title: 'Project selected', description: `Now tracking ${project.name}` });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to save project', description: error.message, variant: 'destructive' });
    }
  }, [projects, saveProject, setSelectedProject, toast]);

  return (
    <div className="space-y-4">
      {sp?.projectId && (
        <div className="flex items-center gap-2 text-sm bg-secondary rounded-md px-3 py-2">
          <span className="font-medium">Current project:</span>
          <span>{sp.projectName}</span>
          <Badge variant="outline">{sp.projectId}</Badge>
        </div>
      )}

      <div className="grid gap-2">
        <Label>Search & Select Project</Label>
        <div className="space-y-2">
          <Input
            placeholder="Type to search projects (min 2 chars)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {isFetching && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Searching...
            </div>
          )}
          {options.length > 0 && (
            <Combobox
              options={options}
              value={selectedValue}
              onChange={handleSelect}
              placeholder="Select a project..."
              searchPlaceholder="Filter results..."
            />
          )}
          {debouncedQuery.length >= 2 && !isFetching && options.length === 0 && (
            <p className="text-sm text-muted-foreground">No projects found for "{debouncedQuery}"</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground mt-1">Configure your Jira and Tempo connection</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">API Credentials</CardTitle>
        </CardHeader>
        <CardContent>
          <CredentialsForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Project Selection</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectSelector />
        </CardContent>
      </Card>
    </div>
  );
}
