import { NextRequest, NextResponse } from "next/server";

// API 기본 URL
const API_URL =
  "https://1ziq80nhcc.execute-api.ap-northeast-2.amazonaws.com/dev";

export async function POST(request: NextRequest) {
  try {
    // 요청 본문 파싱
    const body = await request.json();
    console.log("출석 기록 요청 데이터:", JSON.stringify(body));

    // 요청 데이터 검증
    if (!body.number || typeof body.number !== "number") {
      console.error("잘못된 요청 데이터:", body);
      return NextResponse.json(
        { success: false, error: "유효하지 않은 출석번호입니다." },
        { status: 400 }
      );
    }

    console.log(`원격 API 호출 시작: ${API_URL}/attendance/record`);

    // 원격 API로 요청 전송
    const response = await fetch(`${API_URL}/attendance/record`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    console.log(
      `원격 API 응답 상태: ${response.status} ${response.statusText}`
    );

    // 응답이 JSON이 아닐 수 있으므로 먼저 텍스트로 읽기
    const responseText = await response.text();
    console.log("원격 API 응답 텍스트:", responseText);

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSON 파싱 오류:", parseError);
      console.error("응답 텍스트:", responseText);
      return NextResponse.json(
        {
          success: false,
          error: "서버 응답을 처리할 수 없습니다.",
          details: `HTTP ${response.status}: ${responseText.substring(0, 200)}`,
        },
        { status: 500 }
      );
    }

    // 디버깅을 위해 응답 데이터 로깅
    console.log("출석 기록 API 파싱된 응답:", JSON.stringify(data));

    // 원격 API가 실패한 경우
    if (!response.ok) {
      console.error(`원격 API 오류 (${response.status}):`, data);

      // 중복 출석 메시지가 포함된 경우 (서버가 500으로 응답하더라도)
      const isDuplicateMessage =
        (data.message &&
          data.message.includes("이미 출석한 이력이 있습니다")) ||
        (data.error && data.error.includes("이미 출석한 이력이 있습니다")) ||
        (data.message &&
          data.message.includes("오늘 이미 출석한 이력이 있습니다")) ||
        (data.error && data.error.includes("오늘 이미 출석한 이력이 있습니다"));

      if (isDuplicateMessage) {
        console.log("중복 출석 감지 - 400 상태로 변경하여 응답");
        return NextResponse.json(
          {
            success: false,
            message: "오늘 이미 출석한 이력이 있습니다.",
            isDuplicate: true,
          },
          { status: 400 } // 중복 출석은 400으로 변경
        );
      }

      // 중복 출석 등의 비즈니스 로직 오류는 클라이언트에 전달
      if (response.status === 400 || response.status === 409) {
        return NextResponse.json(data, { status: response.status });
      }

      // 서버 오류는 500으로 통일
      return NextResponse.json(
        {
          success: false,
          error: data.error || data.message || "원격 서버 오류가 발생했습니다.",
          originalStatus: response.status,
        },
        { status: 500 }
      );
    }

    // 성공 응답을 그대로 전달
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("출석 기록 프록시 오류:", error);

    // 네트워크 오류 등의 상세 정보 제공
    if (error instanceof TypeError && error.message.includes("fetch")) {
      return NextResponse.json(
        {
          success: false,
          error: "원격 서버에 연결할 수 없습니다.",
          details: error.message,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "출석 기록 중 예상치 못한 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
