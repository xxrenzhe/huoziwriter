type ReferralUserLike = {
  id: number;
  username: string;
  referral_code?: string | null;
};

function referralSlug(username: string) {
  const normalized = username
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || "USER";
}

export function buildReferralCode(userId: number, username: string) {
  return `HZ-${referralSlug(username)}-${userId}`;
}

export function normalizeReferralCode(value: string) {
  return value.trim().toUpperCase();
}

export function parseReferralCodeUserId(value: string) {
  const normalized = normalizeReferralCode(value);
  const match = normalized.match(/-(\d+)$/);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export function getReferralCodeForUser(user: ReferralUserLike) {
  if (user.referral_code?.trim()) {
    return normalizeReferralCode(user.referral_code);
  }
  return buildReferralCode(user.id, user.username);
}

export function matchesReferralCode(user: ReferralUserLike, referralCode: string) {
  return getReferralCodeForUser(user) === normalizeReferralCode(referralCode);
}
