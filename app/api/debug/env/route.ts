import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // 환경변수 상태 확인
    const envStatus = {
      // 구글 API 관련
      GOOGLE_CLIENT_EMAIL: {
        exists: !!process.env.GOOGLE_CLIENT_EMAIL,
        length: process.env.GOOGLE_CLIENT_EMAIL?.length || 0,
        value: process.env.GOOGLE_CLIENT_EMAIL || "UNDEFINED",
      },
      GOOGLE_PRIVATE_KEY: {
        exists: !!process.env.GOOGLE_PRIVATE_KEY,
        length: process.env.GOOGLE_PRIVATE_KEY?.length || 0,
        hasBeginMarker:
          process.env.GOOGLE_PRIVATE_KEY?.includes(
            "-----BEGIN PRIVATE KEY-----"
          ) || false,
        hasEndMarker:
          process.env.GOOGLE_PRIVATE_KEY?.includes(
            "-----END PRIVATE KEY-----"
          ) || false,
        preview: process.env.GOOGLE_PRIVATE_KEY
          ? process.env.GOOGLE_PRIVATE_KEY.substring(0, 50) + "..."
          : "UNDEFINED",
      },
      GOOGLE_SPREADSHEET_ID: {
        exists: !!process.env.GOOGLE_SPREADSHEET_ID,
        length: process.env.GOOGLE_SPREADSHEET_ID?.length || 0,
        value: process.env.GOOGLE_SPREADSHEET_ID || "UNDEFINED",
      },

      // 기타 Next.js 환경변수들
      NODE_ENV: process.env.NODE_ENV || "UNDEFINED",
      VERCEL: process.env.VERCEL || "UNDEFINED",

      // 구글 관련 환경변수 목록
      allGoogleEnvs: Object.keys(process.env).filter((key) =>
        key.includes("GOOGLE")
      ),

      // 전체 환경변수 개수
      totalEnvCount: Object.keys(process.env).length,
    };

    // 콘솔에도 출력
    console.log("=== 환경변수 상태 디버깅 ===");
    console.log(JSON.stringify(envStatus, null, 2));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: envStatus,
    });
  } catch (error: any) {
    console.error("환경변수 디버깅 오류:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
