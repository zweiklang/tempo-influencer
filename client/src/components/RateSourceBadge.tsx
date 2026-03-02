import React from 'react';
import { Badge } from '@/components/ui/badge';

export function RateSourceBadge({ source, className = 'ml-1' }: { source?: string; className?: string }) {
  if (source === 'override') return <Badge className={`${className} text-xs bg-blue-100 text-blue-800 border-0`}>override</Badge>;
  if (source === 'global') return <Badge variant="secondary" className={`${className} text-xs`}>global</Badge>;
  if (source === 'project-default') return <Badge className={`${className} text-xs bg-purple-100 text-purple-800 border-0`}>project default</Badge>;
  return <Badge variant="destructive" className={`${className} text-xs`}>none</Badge>;
}
