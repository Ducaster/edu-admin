import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL =
  "https://1ziq80nhcc.execute-api.ap-northeast-2.amazonaws.com/dev";

export async function GET(request: NextRequest) {
  try {
    // URL 파라미터 추출
    const searchParams = request.nextUrl.searchParams;
    const date = searchParams.get("date");
    const sessionId = searchParams.get("sessionId");

    // 인증 토큰 추출
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    // URL 구성
    let url = `${API_BASE_URL}/admin/attendance?date=${date}`;
    if (sessionId) {
      url += `&sessionId=${sessionId}`;
    }

    console.log(`출석 조회 API 요청: ${url}`);
    console.log(`요청 파라미터: date=${date}, sessionId=${sessionId}`);

    // AWS API Gateway로 요청 전달
    const response = await fetch(url, {
      headers: {
        Authorization: authHeader,
      },
    });

    // 응답 데이터 가져오기
    const data = await response.json();

    console.log(
      `백엔드 응답 데이터 건수: ${data.data ? data.data.length : 0}건`
    );
    if (data.data && data.data.length > 0) {
      console.log(`응답 데이터 샘플:`, data.data.slice(0, 3));
    }

    // 클라이언트에게 응답 반환
    return NextResponse.json(data);
  } catch (error) {
    console.error("출석 데이터 프록시 오류:", error);
    return NextResponse.json(
      {
        success: false,
        error: "출석 데이터를 불러오는 중 오류가 발생했습니다.",
      },
      { status: 500 }
    );
  }
}
