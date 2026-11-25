import { queryOptions } from '@tanstack/react-query';
import { getWorkspace } from './workspace.functions';
export const workspaceQuery=()=>queryOptions({queryKey:['workspace'],queryFn:()=>getWorkspace(),refetchInterval:10000,staleTime:3000});
