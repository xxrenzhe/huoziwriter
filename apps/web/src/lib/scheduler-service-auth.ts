const DEFAULT_SCHEDULER_SERVICE_TOKEN = "change_me_to_a_random_64_char_secret";

export function getSchedulerServiceToken() {
  return process.env.SCHEDULER_SERVICE_TOKEN || process.env.JWT_SECRET || DEFAULT_SCHEDULER_SERVICE_TOKEN;
}

export function isSchedulerServiceAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  return authorization === `Bearer ${getSchedulerServiceToken()}`;
}
