import { NextRequest, NextResponse } from "next/server";

// API 기본 URL
const API_URL =
  "https://1ziq80nhcc.execute-api.ap-northeast-2.amazonaws.com/dev";

export async function POST(request: NextRequest) {
  try {
    // 요청 본문 파싱
    const body = await request.json();

    // 원격 API 요청을 위한 헤더 가져오기
    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: "인증 토큰이 필요합니다." },
        { status: 401 }
      );
    }

    // 원격 API로 요청 전송
    const response = await fetch(`${API_URL}/admin/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify(body),
    });

    // 응답 파싱
    const data = await response.json();

    // 원격 API 응답을 그대로 전달
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("관리자 계정 생성 프록시 오류:", error);
    return NextResponse.json(
      { success: false, error: "관리자 계정 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
