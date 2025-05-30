"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getToken } from "./services/api";

export default function Home() {
  const router = useRouter();

  // 토큰이 있는 경우에만 대시보드로 리다이렉트
  useEffect(() => {
    const token = getToken();
    if (token) {
      router.push("/dashboard");
    }
    // 토큰이 없는 경우에는 next.config.ts에서 /login으로 리다이렉트됨
  }, [router]);

  return (
    <div className="min-h-screen flex justify-center items-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-gray-700">
          교육 관리 시스템
        </h1>
        <p className="mt-2 text-gray-500">페이지 이동 중...</p>
      </div>
    </div>
  );
}
