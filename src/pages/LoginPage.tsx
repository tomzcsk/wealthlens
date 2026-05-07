import { type ReactNode } from 'react';

import { useGoogleAuth } from '@/auth/useGoogleAuth';

const FEATURES: ReadonlyArray<{ icon: string; label: string }> = [
  { icon: '🔒', label: 'ข้อมูลอยู่ใน Google Drive ของคุณ — ไม่มี server กลาง' },
  { icon: '📊', label: 'ติดตามรายรับ-รายจ่าย ออม-ลงทุน รายเดือน/รายปี' },
  { icon: '🧮', label: 'คำนวณภาษีเงินได้บุคคลธรรมดา (Thailand PIT)' },
  { icon: '☁️', label: 'Sync อัตโนมัติทุกเครื่องที่เข้าด้วย Gmail เดียวกัน' },
];

export const LoginPage = (): ReactNode => {
  const { signIn, isReady } = useGoogleAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3" aria-hidden="true">
            💰
          </div>
          <h1 className="text-4xl font-bold text-primary tracking-tight">
            WealthLens
          </h1>
          <p className="mt-2 text-base text-slate-600">
            Personal Finance Dashboard ส่วนตัว
          </p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-xl font-semibold text-slate-900">
              ยินดีต้อนรับ
            </h2>
            <p className="text-sm text-slate-500 leading-relaxed">
              เข้าสู่ระบบด้วย Gmail
              ของคุณเพื่อเริ่มใช้งาน — ข้อมูลจะถูกบันทึกใน Google Drive
              ส่วนตัวของคุณเท่านั้น
            </p>
          </div>

          {isReady ? (
            <button
              type="button"
              onClick={signIn}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 hover:border-primary hover:bg-primary-light/30 text-slate-900 font-semibold px-5 py-3 rounded-xl transition-all shadow-sm hover:shadow-md"
            >
              <GoogleLogo />
              <span>เข้าสู่ระบบด้วย Google</span>
            </button>
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-900">
              <div className="font-semibold mb-1">⚠️ Drive Sync ปิดอยู่</div>
              <p className="text-xs leading-relaxed text-amber-800">
                ตั้งค่า{' '}
                <code className="bg-white px-1.5 py-0.5 rounded text-amber-900 border border-amber-200">
                  VITE_GOOGLE_CLIENT_ID
                </code>{' '}
                ใน{' '}
                <code className="bg-white px-1.5 py-0.5 rounded text-amber-900 border border-amber-200">
                  .env.local
                </code>{' '}
                เพื่อเปิดใช้ — ดูรายละเอียดที่{' '}
                <a
                  href="https://github.com/tomzcsk/wealthlens#setup-google-oauth-สำหรับ-drive-sync"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-medium"
                >
                  README
                </a>
              </p>
            </div>
          )}

          <ul className="space-y-2.5 pt-3 border-t border-slate-100">
            {FEATURES.map((f) => (
              <li
                key={f.label}
                className="flex items-start gap-3 text-sm text-slate-600"
              >
                <span aria-hidden="true" className="text-base">
                  {f.icon}
                </span>
                <span className="leading-relaxed">{f.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-slate-400">
          Drive scope:{' '}
          <code className="px-1 py-0.5 bg-white/60 rounded">drive.file</code>{' '}
          — เห็นแค่ไฟล์ที่แอปสร้างเอง
        </p>
      </div>
    </div>
  );
};

const GoogleLogo = (): ReactNode => (
  <svg
    aria-hidden="true"
    width="20"
    height="20"
    viewBox="0 0 48 48"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      fill="#FFC107"
      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
    />
    <path
      fill="#FF3D00"
      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
    />
    <path
      fill="#4CAF50"
      d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
    />
    <path
      fill="#1976D2"
      d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);

export default LoginPage;
