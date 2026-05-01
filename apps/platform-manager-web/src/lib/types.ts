export type PlatformStatus = 'CREATING' | 'BUILDING' | 'RUNNING' | 'STOPPED' | 'FAILED';

export interface Platform {
  id: string;
  slug: string;
  domain: string;
  displayName: string;
  status: PlatformStatus;
  siteUrl: string | null;
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}
