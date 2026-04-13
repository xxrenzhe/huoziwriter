const DEFAULT_INTERNAL_TOKEN = "change_me_to_a_random_64_char_secret";

export function getInternalSchedulerToken() {
  return process.env.INTERNAL_SCHEDULER_TOKEN || process.env.JWT_SECRET || DEFAULT_INTERNAL_TOKEN;
}

export function isInternalSchedulerAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${getInternalSchedulerToken()}`;
}
