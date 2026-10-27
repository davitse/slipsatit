import { NextResponse, type NextRequest } from 'next/server';

// ถ้าตั้ง APP_USER และ APP_PASSWORD จะบังคับ Basic Auth ทั้งเว็บ (กันคนนอกอัปโหลดแล้วเสียค่า API)
export function middleware(req: NextRequest) {
  const user = process.env.APP_USER;
  const pass = process.env.APP_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const header = req.headers.get('authorization') ?? '';
  if (header.startsWith('Basic ')) {
    const [u, ...rest] = atob(header.slice(6)).split(':');
    if (u === user && rest.join(':') === pass) return NextResponse.next();
  }
  return new NextResponse('ต้องล็อกอินก่อนใช้งาน', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="SlipSatit", charset="UTF-8"' },
  });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
