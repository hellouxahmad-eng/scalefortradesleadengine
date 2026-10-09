import { NextResponse } from 'next/server';

// Gates the whole dashboard (pages + API) behind a password, while letting the
// worker through with its token header. Set DASHBOARD_PASSWORD to enable; if it
// is unset (local dev) the gate is open.
export function middleware(req) {
  // Worker authenticates with a token header — pass it through untouched.
  const wt = process.env.WORKER_TOKEN;
  if (wt && req.headers.get('x-worker-token') === wt) return NextResponse.next();

  const pass = process.env.DASHBOARD_PASSWORD;
  if (!pass) return NextResponse.next();

  const auth = req.headers.get('authorization') || '';
  const expected = 'Basic ' + btoa('admin:' + pass);
  if (auth === expected) return NextResponse.next();

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Agency Lead Engine"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
