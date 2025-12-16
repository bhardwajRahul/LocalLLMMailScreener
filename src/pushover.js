import axios from 'axios';

export const sendPushover = async ({
  token,
  user,
  title,
  message,
  priority = 2,
  retry = 100,
  expire = 7 * 24 * 60 * 60,
  device,
  httpClient = axios,
  dryRun = false
}) => {
  if (dryRun) {
    return { receipt: 'DRY_RUN', status: 'dry_run' };
  }
  if (!token || !user) {
    throw new Error('Missing Pushover credentials');
  }
  const payload = { token, user, title, message, priority, retry, expire };
  if (device) payload.device = device;

  const res = await httpClient.post('https://api.pushover.net/1/messages.json', payload, {
    timeout: 15000
  });
  const data = res.data || {};
  if (data.status !== 1) {
    const errors = Array.isArray(data.errors) ? data.errors.join(', ') : data.error || 'Pushover send failed';
    throw new Error(errors);
  }
  return { receipt: data.receipt || data.request, status: 'sent' };
};

export const checkPushoverCredentials = async ({ token, user, device, httpClient = axios }) => {
  if (!token || !user) return { ok: false, error: 'Missing Pushover token/user' };
  try {
    await httpClient.post(
      'https://api.pushover.net/1/users/validate.json',
      { token, user, device },
      { timeout: 10000 }
    );
    return { ok: true };
  } catch (err) {
    const msg =
      err.response?.data?.errors?.join(', ') ||
      err.response?.data?.error ||
      err.message ||
      'Pushover validation failed';
    return { ok: false, error: msg };
  }
};
