import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { useCredentials, useSaveCredentials, useSelectedProject, useSaveProject, useTempoProjects, useGeminiSettings, useSaveGeminiSettings, useGeminiModels } from '@/hooks/useSettings';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface TempoFinancialProject {
  id: string;
  name: string;
  status: string;
}

// Project Selector
function ProjectSelector() {
  const { toast } = useToast();
  const { data: selectedProjectData } = useSelectedProject();
  const saveProject = useSaveProject();
  const setSelectedProject = useAppStore((s) => s.setSelectedProject);

  const [selectedValue, setSelectedValue] = useState('');
  const [jiraKey, setJiraKey] = useState('');

  const sp = selectedProjectData as {
    projectId?: string;
    projectName?: string;
    tempoId?: string;
    jiraProjectKey?: string;
  } | undefined;

  const { data: projectsData, isLoading: projectsLoading } = useTempoProjects();
  const allProjects = (projectsData as TempoFinancialProject[]) || [];
  const options = allProjects.map((p) => ({
    value: p.id,
    label: p.status === 'IN_PROGRESS' ? p.name : `${p.name} (${p.status})`,
  }));

  const handleSelect = useCallback(async (value: string) => {
    setSelectedValue(value);
    const project = allProjects.find((p) => p.id === value);
    if (!project) return;
    try {
      await saveProject.mutateAsync({
        projectId: project.id,
        projectName: project.name,
        tempoId: project.id,
        jiraProjectKey: jiraKey || sp?.jiraProjectKey,
      });
      setSelectedProject({
        projectId: project.id,
        projectName: project.name,
        tempoId: project.id,
        jiraProjectKey: jiraKey || sp?.jiraProjectKey,
      });
      toast({ title: 'Project selected', description: `Now tracking ${project.name}` });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to save project', description: error.message, variant: 'destructive' });
    }
  }, [allProjects, jiraKey, sp?.jiraProjectKey, saveProject, setSelectedProject, toast]);

  const handleSaveJiraKey = async () => {
    if (!jiraKey.trim()) return;
    try {
      await saveProject.mutateAsync({
        projectId: sp?.projectId ?? '',
        projectName: sp?.projectName ?? '',
        tempoId: sp?.tempoId,
        jiraProjectKey: jiraKey.trim(),
      });
      setSelectedProject({
        projectId: sp?.projectId ?? '',
        projectName: sp?.projectName ?? '',
        tempoId: sp?.tempoId,
        jiraProjectKey: jiraKey.trim(),
      });
      toast({ title: 'Jira project key saved' });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-4">
      {sp?.projectName && (
        <div className="flex items-center gap-2 text-sm bg-secondary rounded-md px-3 py-2">
          <span className="font-medium">Current project:</span>
          <span>{sp.projectName}</span>
          {sp.jiraProjectKey && (
            <Badge variant="outline" className="text-xs">{sp.jiraProjectKey}</Badge>
          )}
        </div>
      )}

      <div className="grid gap-2">
        <Label>Select Tempo Financial Project</Label>
        {projectsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading projects...
          </div>
        ) : (
          <Combobox
            options={options}
            value={selectedValue || sp?.projectId || ''}
            onChange={handleSelect}
            placeholder="Choose a project..."
            searchPlaceholder="Type to filter projects..."
          />
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="jiraProjectKey">Jira Project Key</Label>
        <p className="text-xs text-muted-foreground">Used to fetch open issues (e.g. DP2, SEUK)</p>
        <div className="flex gap-2">
          <Input
            id="jiraProjectKey"
            placeholder={sp?.jiraProjectKey ?? 'e.g. DP2'}
            value={jiraKey}
            onChange={(e) => setJiraKey(e.target.value)}
            className="max-w-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveJiraKey}
            disabled={!jiraKey.trim() || saveProject.isPending}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// Gemini Settings
function GeminiSettings() {
  const { toast } = useToast();
  const { data: geminiSettingsData, isLoading } = useGeminiSettings();
  const saveGeminiSettings = useSaveGeminiSettings();
  const { data: modelsData, isLoading: modelsLoading, isError: modelsError } = useGeminiModels();

  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');

  const gs = geminiSettingsData as {
    configured?: boolean;
    geminiTokenSavedAt?: string;
    model?: string | null;
  } | undefined;

  const models = (modelsData as { id: string; displayName: string }[]) ?? [];

  // Init selectedModel from stored value or first model
  useEffect(() => {
    if (selectedModel) return;
    if (gs?.model) {
      setSelectedModel(gs.model);
    } else if (models.length > 0) {
      setSelectedModel(models[0].id);
    }
  }, [gs?.model, models, selectedModel]);

  const getDaysSince = (dateStr?: string): number | null => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  };

  const tokenDays = getDaysSince(gs?.geminiTokenSavedAt);

  const handleSave = async () => {
    try {
      await saveGeminiSettings.mutateAsync({ apiKey: apiKey || undefined, model: selectedModel || undefined });
      setApiKey('');
      toast({ title: 'Gemini settings saved' });
    } catch (err: unknown) {
      const error = err as Error;
      toast({ title: 'Failed to save', description: error.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Gemini status...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {gs?.configured ? (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
          <CheckCircle className="h-4 w-4" />
          API key configured
          {tokenDays !== null && (
            <span className="text-xs text-green-600 ml-auto">
              {tokenDays === 0 ? 'Saved just now' : `Saved ${tokenDays} day${tokenDays === 1 ? '' : 's'} ago`}
            </span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">
          <AlertCircle className="h-4 w-4" />
          Not configured
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="geminiApiKey">API Key</Label>
        <Input
          id="geminiApiKey"
          type="password"
          placeholder={gs?.configured ? 'Leave blank to keep existing key' : 'AIza…'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label>Model</Label>
        {modelsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying key…
          </div>
        ) : models.length === 0 ? (
          <Select disabled>
            <SelectTrigger>
              <SelectValue placeholder={gs?.configured ? 'Verifying key…' : 'Save API key first'} />
            </SelectTrigger>
            <SelectContent />
          </Select>
        ) : (
          <Select value={selectedModel} onValueChange={setSelectedModel}>
            <SelectTrigger>
              <SelectValue placeholder="Select a model…" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.displayName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {modelsError && (
          <p className="text-xs text-destructive">Could not load models — check that the API key is valid.</p>
        )}
      </div>

      <Button onClick={handleSave} disabled={saveGeminiSettings.isPending || (!apiKey && !selectedModel)}>
        {saveGeminiSettings.isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving...
          </>
        ) : (
          'Save'
        )}
      </Button>
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

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Gemini AI</CardTitle>
        </CardHeader>
        <CardContent>
          <GeminiSettings />
        </CardContent>
      </Card>
    </div>
  );
}
