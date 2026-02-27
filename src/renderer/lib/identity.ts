// ── Identity types & constants (shared between onboarding + settings) ──

export type Role = 'freelancer' | 'developer' | 'student' | 'creative' | 'other';
export type CommunicationStyle = 'direct' | 'friendly' | 'professional';

export const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'developer', label: 'Developer' },
  { value: 'student', label: 'Student' },
  { value: 'creative', label: 'Creative' },
  { value: 'other', label: 'Other' },
];

export const COMMUNICATION_OPTIONS: {
  value: CommunicationStyle;
  label: string;
  shortLabel: string;
  hint: string;
}[] = [
  { value: 'direct', label: 'Direct & concise', shortLabel: 'Direct', hint: 'Short.' },
  { value: 'friendly', label: 'Friendly & casual', shortLabel: 'Friendly', hint: 'Warm.' },
  { value: 'professional', label: 'Professional', shortLabel: 'Professional', hint: 'Thorough.' },
];

export const buildIdentityString = (
  userName: string,
  role: Role | null,
  style: CommunicationStyle | null,
  focus: string,
): string => {
  const parts: string[] = [];

  if (userName.trim().length > 0) {
    parts.push(`The user's name is ${userName.trim()}.`);
  }

  if (role && role !== 'other') {
    const roleLabel = ROLE_OPTIONS.find((o) => o.value === role)?.label.toLowerCase() ?? role;
    parts.push(`They are a ${roleLabel}.`);
  }

  if (style) {
    const styleLabel = COMMUNICATION_OPTIONS.find((o) => o.value === style)?.shortLabel.toLowerCase() ?? style;
    parts.push(`They prefer ${styleLabel} communication.`);
  }

  if (focus.trim().length > 0) {
    parts.push(`Their main focus is: ${focus.trim()}.`);
  }

  return parts.join(' ');
};
