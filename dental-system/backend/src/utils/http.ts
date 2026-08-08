export function httpError(message: string, status: number): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}

export function getErrorStatus(err: unknown): number {
  if (err && typeof err === 'object' && 'status' in err) {
    return Number((err as { status: number }).status) || 500;
  }
  return 500;
}

export function sendError(res: import('express').Response, err: unknown): boolean {
  const status = getErrorStatus(err);
  if (status < 500) {
    res.status(status).json({ message: (err as Error).message });
    return true;
  }
  return false;
}
