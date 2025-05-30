import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // 다양한 방식으로 환경변수 접근 시도
    const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY;
    const processedPrivateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(
      /\\n/g,
      "\n"
    );

    const envStatus = {
      // 구글 API 관련 - 기본 방식
      GOOGLE_CLIENT_EMAIL: {
        exists: !!process.env.GOOGLE_CLIENT_EMAIL,
        length: process.env.GOOGLE_CLIENT_EMAIL?.length || 0,
        value: process.env.GOOGLE_CLIENT_EMAIL || "UNDEFINED",
      },
      GOOGLE_PRIVATE_KEY: {
        exists: !!rawPrivateKey,
        length: rawPrivateKey?.length || 0,
        rawHasBeginMarker:
          rawPrivateKey?.includes("-----BEGIN PRIVATE KEY-----") || false,
        rawHasEndMarker:
          rawPrivateKey?.includes("-----END PRIVATE KEY-----") || false,
        rawHasBackslashN: rawPrivateKey?.includes("\\n") || false,
        rawHasRealNewline: rawPrivateKey?.includes("\n") || false,
        processedHasBeginMarker:
          processedPrivateKey?.includes("-----BEGIN PRIVATE KEY-----") || false,
        processedHasEndMarker:
          processedPrivateKey?.includes("-----END PRIVATE KEY-----") || false,
        rawPreview: rawPrivateKey
          ? rawPrivateKey.substring(0, 100) + "..."
          : "UNDEFINED",
        processedPreview: processedPrivateKey
          ? processedPrivateKey.substring(0, 100) + "..."
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

      // PEM 키 분석
      pemAnalysis: rawPrivateKey
        ? {
            totalLines: rawPrivateKey.split("\n").length,
            backslashNCount: (rawPrivateKey.match(/\\n/g) || []).length,
            realNewlineCount: (rawPrivateKey.match(/\n/g) || []).length,
            firstLine:
              rawPrivateKey.split("\n")[0] || rawPrivateKey.split("\\n")[0],
            lastLine:
              rawPrivateKey.split("\n").pop() ||
              rawPrivateKey.split("\\n").pop(),
          }
        : null,
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
      rawPrivateKey ? `EXISTS (${rawPrivateKey.length} chars)` : "NOT_EXISTS"
    );
    console.log(
      "GOOGLE_SPREADSHEET_ID:",
      process.env.GOOGLE_SPREADSHEET_ID ? "EXISTS" : "NOT_EXISTS"
    );

    if (rawPrivateKey) {
      console.log("=== Private Key 분석 ===");
      console.log("Raw key starts with:", rawPrivateKey.substring(0, 50));
      console.log(
        "Raw key ends with:",
        rawPrivateKey.substring(rawPrivateKey.length - 50)
      );
      console.log("Contains \\n:", rawPrivateKey.includes("\\n"));
      console.log("Contains real newline:", rawPrivateKey.includes("\n"));
    }

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
