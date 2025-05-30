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
    const { sessionName, data } = await request.json();

    if (!sessionName || !data || !Array.isArray(data)) {
      return NextResponse.json(
        { success: false, error: "세션명과 데이터가 필요합니다." },
        { status: 400 }
      );
    }

    // 환경 변수에서 구글 API 설정 읽기
    const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

    if (!clientEmail || !privateKey || !spreadsheetId) {
      console.error("Missing Google API credentials:", {
        hasClientEmail: !!clientEmail,
        hasPrivateKey: !!privateKey,
        hasSpreadsheetId: !!spreadsheetId,
      });
      return NextResponse.json(
        { success: false, error: "구글 API 설정이 누락되었습니다." },
        { status: 500 }
      );
    }

    // Google Sheets API 인증
    const auth = new google.auth.JWT(clientEmail, undefined, privateKey, [
      "https://www.googleapis.com/auth/spreadsheets",
    ]);

    const sheets = google.sheets({ version: "v4", auth });

    try {
      // 먼저 해당 시트가 존재하는지 확인
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
      });

      const existingSheet = spreadsheet.data.sheets?.find(
        (sheet) => sheet.properties?.title === sessionName
      );

      if (!existingSheet) {
        // 시트가 없으면 새로 생성
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
        console.log(`새 시트 생성: ${sessionName}`);
      } else {
        // 기존 시트가 있으면 내용 삭제
        await sheets.spreadsheets.values.clear({
          spreadsheetId: spreadsheetId,
          range: `${sessionName}!A:Z`,
        });
        console.log(`기존 시트 내용 삭제: ${sessionName}`);
      }

      // 데이터 업로드
      await sheets.spreadsheets.values.update({
        spreadsheetId: spreadsheetId,
        range: `${sessionName}!A1`,
        valueInputOption: "RAW",
        requestBody: {
          values: data,
        },
      });

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

      console.log(`데이터 업로드 완료: ${sessionName}, ${data.length}행`);

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
      console.error("Google Sheets API 오류:", sheetsError);
      return NextResponse.json(
        {
          success: false,
          error: `구글 시트 API 오류: ${sheetsError.message}`,
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("구글 시트 내보내기 오류:", error);
    return NextResponse.json(
      {
        success: false,
        error: `서버 내부 오류: ${error.message}`,
      },
      { status: 500 }
    );
  }
}
