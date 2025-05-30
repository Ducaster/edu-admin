import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(request: NextRequest) {
  try {
    console.log("=== 구글 API 연결 테스트 시작 ===");

    // 환경변수 확인
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    const status = {
      environment: process.env.NODE_ENV,
      hasClientEmail: !!clientEmail,
      hasPrivateKey: !!privateKey,
      hasSpreadsheetId: !!spreadsheetId,
      clientEmail: clientEmail || "MISSING",
      spreadsheetId: spreadsheetId || "MISSING",
      privateKeyPreview: privateKey
        ? privateKey.substring(0, 50) + "..."
        : "MISSING",
    };

    console.log("환경변수 상태:", status);

    // 환경변수가 없으면 여기서 중단
    if (!clientEmail || !privateKey || !spreadsheetId) {
      return NextResponse.json({
        success: false,
        error: "환경변수 누락",
        status,
        missing: {
          clientEmail: !clientEmail,
          privateKey: !privateKey,
          spreadsheetId: !spreadsheetId,
        },
      });
    }

    // Google Sheets API 연결 테스트
    try {
      const auth = new google.auth.JWT(clientEmail, undefined, privateKey, [
        "https://www.googleapis.com/auth/spreadsheets",
      ]);

      const sheets = google.sheets({ version: "v4", auth });

      // 스프레드시트 기본 정보 가져오기 (읽기 전용 테스트)
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
      });

      const result = {
        success: true,
        message: "구글 API 연결 성공!",
        spreadsheetInfo: {
          title: spreadsheet.data.properties?.title,
          sheetCount: spreadsheet.data.sheets?.length,
          sheets: spreadsheet.data.sheets?.map((s) => s.properties?.title),
        },
        status,
      };

      console.log("✅ 구글 API 연결 성공:", result);
      return NextResponse.json(result);
    } catch (apiError: any) {
      console.error("❌ 구글 API 연결 실패:", apiError);
      return NextResponse.json(
        {
          success: false,
          error: "구글 API 연결 실패",
          details: apiError.message,
          status,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("❌ 전체 테스트 실패:", error);
    return NextResponse.json(
      {
        success: false,
        error: "테스트 실패",
        details: error.message,
      },
      { status: 500 }
    );
  }
}
