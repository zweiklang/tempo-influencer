export interface JiraAvatarUrls {
  '48x48'?: string;
  '24x24'?: string;
  '16x16'?: string;
  '32x32'?: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  avatarUrls?: JiraAvatarUrls;
}

export interface JiraStatusCategory {
  id: number;
  key: string;
  name: string;
}

export interface JiraStatus {
  statusCategory: JiraStatusCategory;
  name?: string;
}

export interface JiraAssignee {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

export interface JiraIssueType {
  name: string;
}

export interface JiraIssueFields {
  summary: string;
  status: JiraStatus;
  assignee?: JiraAssignee | null;
  issuetype?: JiraIssueType;
  labels?: string[];
  parent?: { fields?: { summary?: string } };
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: JiraIssueFields;
}

export interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}
