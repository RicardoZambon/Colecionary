export type MemberRole = 'Owner' | 'Editor' | 'Viewer';

export interface Member {
  name: string;
  email: string;
  initials: string;
  role: MemberRole;
}
