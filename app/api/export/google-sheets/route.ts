import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

interface AttendanceRecord {
  studentNumber: number;
  date: string;
  time: string;
  sessionId?: string;
}

export async function POST(request: NextRequest) {
  try {
    console.log("=== 구글 시트 내보내기 시작 ===");

    const { sessionName, data } = await request.json();
    console.log("받은 요청 데이터:", {
      sessionName,
      dataLength: data?.length,
      dataPreview: data?.slice(0, 2),
    });

    if (!sessionName || !data || !Array.isArray(data)) {
      console.log("❌ 잘못된 요청 데이터");
      return NextResponse.json(
        { success: false, error: "세션명과 데이터가 필요합니다." },
        { status: 400 }
      );
    }

    // 환경 변수에서 구글 API 설정 읽기
    console.log("=== 환경변수 확인 시작 ===");
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    // 상세한 환경변수 로깅
    console.log("환경변수 상태:", {
      hasClientEmail: !!clientEmail,
      clientEmailLength: clientEmail?.length || 0,
      clientEmailValue: clientEmail || "UNDEFINED",
      hasPrivateKey: !!privateKey,
      privateKeyLength: privateKey?.length || 0,
      privateKeyStart: privateKey
        ? privateKey.substring(0, 50) + "..."
        : "UNDEFINED",
      privateKeyEnd: privateKey
        ? "..." + privateKey.substring(privateKey.length - 50)
        : "UNDEFINED",
      privateKeyHasBeginMarker:
        privateKey?.includes("-----BEGIN PRIVATE KEY-----") || false,
      privateKeyHasEndMarker:
        privateKey?.includes("-----END PRIVATE KEY-----") || false,
      hasSpreadsheetId: !!spreadsheetId,
      spreadsheetIdLength: spreadsheetId?.length || 0,
      spreadsheetIdValue: spreadsheetId || "UNDEFINED",
    });

    // Node.js 환경변수 전체 확인 (필터링)
    const envVars = Object.keys(process.env).filter((key) =>
      key.includes("GOOGLE")
    );
    console.log("구글 관련 환경변수 목록:", envVars);

    if (!clientEmail || !privateKey || !spreadsheetId) {
      console.error("❌ 구글 API 환경변수 누락:");
      console.error(
        "- GOOGLE_CLIENT_EMAIL:",
        clientEmail ? "✅ 있음" : "❌ 없음"
      );
      console.error(
        "- GOOGLE_PRIVATE_KEY:",
        privateKey ? "✅ 있음" : "❌ 없음"
      );
      console.error(
        "- GOOGLE_SPREADSHEET_ID:",
        spreadsheetId ? "✅ 있음" : "❌ 없음"
      );

      return NextResponse.json(
        { success: false, error: "구글 API 설정이 누락되었습니다." },
        { status: 500 }
      );
    }

    console.log("✅ 모든 환경변수 확인 완료");

    // Google Sheets API 인증 시도
    console.log("=== 구글 API 인증 시작 ===");
    try {
      const auth = new google.auth.JWT(clientEmail, undefined, privateKey, [
        "https://www.googleapis.com/auth/spreadsheets",
      ]);
      console.log("✅ JWT 인증 객체 생성 완료");

      const sheets = google.sheets({ version: "v4", auth });
      console.log("✅ Google Sheets 클라이언트 생성 완료");

      // 스프레드시트 접근 테스트
      console.log("=== 스프레드시트 접근 테스트 ===");
      console.log("스프레드시트 ID:", spreadsheetId);

      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
      });
      console.log("✅ 스프레드시트 접근 성공");
      console.log("스프레드시트 제목:", spreadsheet.data.properties?.title);
      console.log(
        "기존 시트 목록:",
        spreadsheet.data.sheets?.map((s) => s.properties?.title)
      );

      const existingSheet = spreadsheet.data.sheets?.find(
        (sheet) => sheet.properties?.title === sessionName
      );
      console.log("기존 시트 존재 여부:", !!existingSheet);

      if (!existingSheet) {
        console.log("=== 새 시트 생성 ===");
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: sessionName,
                  },
                },
              },
            ],
          },
        });
        console.log(`✅ 새 시트 생성 완료: ${sessionName}`);
      } else {
        console.log("=== 기존 시트 내용 삭제 ===");
        await sheets.spreadsheets.values.clear({
          spreadsheetId: spreadsheetId,
          range: `${sessionName}!A:Z`,
        });
        console.log(`✅ 기존 시트 내용 삭제 완료: ${sessionName}`);
      }

      console.log("=== 데이터 업로드 시작 ===");
      console.log("업로드할 데이터:", {
        rowCount: data.length,
        firstRow: data[0],
        lastRow: data[data.length - 1],
      });

      // 데이터 업로드
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `${sessionName}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: data,
        },
      });
      console.log("✅ 데이터 업로드 완료");

      console.log("=== 헤더 서식 설정 시작 ===");
      // 헤더 행 서식 설정
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: spreadsheetId,
        requestBody: {
          requests: [
            {
              repeatCell: {
                range: {
                  sheetId:
                    existingSheet?.properties?.sheetId ||
                    (
                      await sheets.spreadsheets.get({
                        spreadsheetId: spreadsheetId,
                      })
                    ).data.sheets?.find(
                      (s) => s.properties?.title === sessionName
                    )?.properties?.sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                  startColumnIndex: 0,
                  endColumnIndex: 4,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.9, green: 0.9, blue: 1.0 },
                    textFormat: { bold: true },
                  },
                },
                fields: "userEnteredFormat(backgroundColor,textFormat)",
              },
            },
          ],
        },
      });
      console.log("✅ 헤더 서식 설정 완료");

      console.log(`✅ 전체 작업 완료: ${sessionName}, ${data.length}행`);

      // 구글 시트 URL 생성
      const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

      return NextResponse.json({
        success: true,
        message: `${sessionName} 시트에 ${
          data.length - 1
        }건의 출석 기록이 업로드되었습니다.`,
        sheetName: sessionName,
        recordCount: data.length - 1,
        sheetUrl: sheetUrl,
      });
    } catch (sheetsError: any) {
      console.error("❌ Google Sheets API 오류:");
      console.error("오류 타입:", sheetsError.constructor.name);
      console.error("오류 메시지:", sheetsError.message);
      console.error("오류 코드:", sheetsError.code);
      console.error("오류 상태:", sheetsError.status);
      console.error("전체 오류 객체:", sheetsError);

      if (sheetsError.response) {
        console.error("응답 상태:", sheetsError.response.status);
        console.error("응답 데이터:", sheetsError.response.data);
      }

      return NextResponse.json(
        {
          success: false,
          error: `구글 시트 API 오류: ${sheetsError.message}`,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("❌ 전체 프로세스 오류:");
    console.error("오류 타입:", error.constructor.name);
    console.error("오류 메시지:", error.message);
    console.error("오류 스택:", error.stack);
    console.error("전체 오류 객체:", error);

    return NextResponse.json(
      {
        success: false,
        error: `서버 내부 오류: ${error.message}`,
      },
      { status: 500 }
    );
  }
}
