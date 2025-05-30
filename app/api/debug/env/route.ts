import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // 다양한 방식으로 환경변수 접근 시도
    const envStatus = {
      // 구글 API 관련 - 기본 방식
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

      // 다른 접근 방식들도 시도
      alternativeAccess: {
        // Vercel/Amplify 환경변수 접근
        GOOGLE_CLIENT_EMAIL_ALT: process.env["GOOGLE_CLIENT_EMAIL"],
        GOOGLE_PRIVATE_KEY_ALT: process.env["GOOGLE_PRIVATE_KEY"]
          ? "EXISTS"
          : "NOT_EXISTS",
        GOOGLE_SPREADSHEET_ID_ALT: process.env["GOOGLE_SPREADSHEET_ID"],
      },

      // 런타임 환경 정보
      runtime: {
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        AWS_REGION: process.env.AWS_REGION,
        AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME,
        _HANDLER: process.env._HANDLER,
      },

      // 구글 관련 환경변수 목록 (더 상세히)
      allGoogleEnvs: Object.keys(process.env).filter((key) =>
        key.includes("GOOGLE")
      ),
      allEnvKeys: Object.keys(process.env).sort(),

      // 전체 환경변수 개수
      totalEnvCount: Object.keys(process.env).length,

      // Next.js 환경변수 정보
      nextjsEnv: {
        NEXT_RUNTIME: process.env.NEXT_RUNTIME,
        VERCEL_ENV: process.env.VERCEL_ENV,
      },
    };

    // 콘솔에도 출력
    console.log("=== 상세 환경변수 디버깅 ===");
    console.log(JSON.stringify(envStatus, null, 2));

    // 환경변수 직접 체크
    console.log("=== 직접 환경변수 체크 ===");
    console.log(
      "GOOGLE_CLIENT_EMAIL:",
      process.env.GOOGLE_CLIENT_EMAIL ? "EXISTS" : "NOT_EXISTS"
    );
    console.log(
      "GOOGLE_PRIVATE_KEY:",
      process.env.GOOGLE_PRIVATE_KEY
        ? `EXISTS (${process.env.GOOGLE_PRIVATE_KEY.length} chars)`
        : "NOT_EXISTS"
    );
    console.log(
      "GOOGLE_SPREADSHEET_ID:",
      process.env.GOOGLE_SPREADSHEET_ID ? "EXISTS" : "NOT_EXISTS"
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      environment: envStatus,
      buildTime: new Date().toISOString(), // 빌드 시간 확인용
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
