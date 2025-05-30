import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  "https://1ziq80nhcc.execute-api.ap-northeast-2.amazonaws.com/dev";

export async function GET(request: NextRequest) {
  try {
    // URL 파라미터 추출
    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get("sessionId");

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "sessionId가 필요합니다." },
        { status: 400 }
      );
    }

    // 인증 토큰 추출
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    // AWS API Gateway로 요청 전달
    const response = await fetch(
      `${API_BASE_URL}/admin/attendance/session?sessionId=${sessionId}`,
      {
        headers: {
          Authorization: authHeader,
        },
      }
    );

    // 응답 데이터 가져오기
    const data = await response.json();

    // 클라이언트에게 응답 반환
    return NextResponse.json(data);
  } catch (error) {
    console.error("회차별 출석 데이터 프록시 오류:", error);
    return NextResponse.json(
      {
        success: false,
        error: "회차별 출석 데이터를 불러오는 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
