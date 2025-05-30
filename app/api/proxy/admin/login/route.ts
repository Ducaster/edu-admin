import { NextRequest, NextResponse } from "next/server";

// API 기본 URL
const API_URL =
  "https://1ziq80nhcc.execute-api.ap-northeast-2.amazonaws.com/dev";

export async function POST(request: NextRequest) {
  try {
    // 요청 본문 파싱
    const body = await request.json();

    // 원격 API로 요청 전송
    const response = await fetch(`${API_URL}/admin/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    // 응답 파싱
    const data = await response.json();

    // 디버깅을 위해 응답 데이터 로깅 (개발 환경에서만)
    console.log("로그인 API 응답:", JSON.stringify(data));

    // refresh_token이 없는 경우 경고 로그
    if (!data.refresh_token && (!data.data || !data.data.refresh_token)) {
      console.warn("로그인 응답에 리프레시 토큰이 없습니다:", data);
    }

    // 원격 API 응답을 그대로 전달
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("로그인 프록시 오류:", error);
    return NextResponse.json(
      { success: false, error: "로그인 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
